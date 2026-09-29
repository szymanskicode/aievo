import { Octokit } from '@octokit/rest';

import { GitError, toGitError } from '../errors.js';
import type {
  CreatePullRequestInput,
  CreateRepoInput,
  GitOwner,
  GitProvider,
  GitRepo,
  InitialCommitInput,
  InitialCommitResult,
  PullRequestComment,
  PullRequestInput,
  PullRequestRef,
  RepoFile,
  TokenInfo,
  TokenType,
} from '../provider.js';

export const GITHUB_API_URL = 'https://api.github.com';

/** Scopes a classic token needs: `repo` covers contents, pull requests and creating repos. */
export const REQUIRED_CLASSIC_SCOPES = ['repo'] as const;

/** More repositories than anyone picks from a list; stops runaway pagination. */
export const MAX_LISTED_REPOS = 1000;

const DEFAULT_TIMEOUT_MS = 30_000;

export interface GitHubProviderOptions {
  /** Defaults to the public GitHub API. */
  baseUrl?: string;
  timeoutMs?: number;
}

// Octokit would otherwise print deprecation notices with request URLs to the console.
const silentLog = { debug() {}, info() {}, warn() {}, error() {} };

/** `fetch` with a timeout; failures become `GitError`s that Octokit passes on as the cause. */
function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      return await fetch(input, { ...init, signal });
    } catch {
      // The original error can quote the URL; the kind is all that is needed.
      throw new GitError(timeout.aborted ? 'timeout' : 'network');
    }
  };
}

function tokenType(token: string): TokenType {
  if (token.startsWith('github_pat_')) return 'fine-grained';
  if (token.startsWith('ghp_')) return 'classic';
  return 'other';
}

/** GitHub sends e.g. `2026-12-31 00:00:00 UTC` or `2026-12-31 08:00:00 +0200`. */
export function parseTokenExpiration(value: string | undefined): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (UTC|[+-]\d{4})$/.exec(value ?? '');
  if (!match) return null;
  const [, date, time, zone] = match as unknown as [string, string, string, string];
  const offset = zone === 'UTC' ? 'Z' : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const parsed = new Date(`${date}T${time}${offset}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseScopes(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope !== '');
}

interface RawRepo {
  owner: { login: string };
  name: string;
  full_name: string;
  private: boolean;
  default_branch?: string;
  description: string | null;
  html_url: string;
}

function toRepo(repo: RawRepo): GitRepo {
  return {
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    defaultBranch: repo.default_branch ?? 'main',
    description: repo.description,
    htmlUrl: repo.html_url,
  };
}

/** Paths come from our own templates, but a bad one must not reach the tree API. */
function checkFiles(files: readonly RepoFile[]): void {
  if (files.length === 0) throw new GitError('validation');
  const seen = new Set<string>();
  for (const { path } of files) {
    const segments = path.split('/');
    const invalid =
      path === '' ||
      path.includes('\\') ||
      segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
      segments[0] === '.git';
    if (invalid || seen.has(path)) throw new GitError('validation');
    seen.add(path);
  }
}

/**
 * GitHub implementation of `GitProvider` (Octokit). The token and the Octokit instance
 * stay in this closure; the returned object exposes the whitelisted operations only.
 */
export function createGitHubProvider(
  token: string,
  { baseUrl = GITHUB_API_URL, timeoutMs = DEFAULT_TIMEOUT_MS }: GitHubProviderOptions = {},
): GitProvider {
  const octokit = new Octokit({
    auth: token,
    baseUrl,
    userAgent: 'aievo',
    log: silentLog,
    request: { fetch: fetchWithTimeout(timeoutMs) },
  });

  /** Every public method goes through here, so nothing but a `GitError` escapes. */
  async function guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw toGitError(error);
    }
  }

  let viewer: Promise<string> | undefined;
  /** Login of the token's account, fetched once per provider instance. */
  function viewerLogin(): Promise<string> {
    viewer ??= octokit.request('GET /user').then((response) => response.data.login);
    viewer.catch(() => {
      viewer = undefined;
    });
    return viewer;
  }

  async function isViewer(owner: string): Promise<boolean> {
    return (await viewerLogin()).toLowerCase() === owner.toLowerCase();
  }

  async function isEmpty(owner: string, repo: string): Promise<boolean> {
    try {
      await octokit.request('GET /repos/{owner}/{repo}/commits', { owner, repo, per_page: 1 });
      return false;
    } catch (error) {
      // GitHub answers 409 "Git Repository is empty" for a repository without commits.
      if ((error as { status?: unknown }).status === 409) return true;
      throw error;
    }
  }

  return {
    verifyToken: () =>
      guard(async () => {
        const response = await octokit.request('GET /user');
        const type = tokenType(token);
        const scopes =
          type === 'fine-grained' ? null : parseScopes(response.headers['x-oauth-scopes']);
        const missingScopes =
          type === 'classic' && scopes
            ? REQUIRED_CLASSIC_SCOPES.filter((scope) => !scopes.includes(scope))
            : [];
        const expiration = response.headers['github-authentication-token-expiration'];
        return {
          login: response.data.login,
          tokenType: type,
          scopes,
          missingScopes,
          expiresAt: parseTokenExpiration(typeof expiration === 'string' ? expiration : undefined),
        } satisfies TokenInfo;
      }),

    listOwners: () =>
      guard(async () => {
        const { data: user } = await octokit.request('GET /user');
        const orgs = await octokit.paginate('GET /user/orgs', { per_page: 100 });
        return [
          { login: user.login, type: 'user', avatarUrl: user.avatar_url || null },
          ...orgs.map((org): GitOwner => ({
            login: org.login,
            type: 'organization',
            avatarUrl: org.avatar_url || null,
          })),
        ] satisfies GitOwner[];
      }),

    listRepos: (owner) =>
      guard(async () => {
        const pages = (await isViewer(owner))
          ? octokit.paginate.iterator('GET /user/repos', {
              affiliation: 'owner',
              sort: 'full_name',
              per_page: 100,
            })
          : octokit.paginate.iterator('GET /orgs/{org}/repos', {
              org: owner,
              sort: 'full_name',
              per_page: 100,
            });

        const repos: GitRepo[] = [];
        for await (const page of pages) {
          repos.push(...(page.data as RawRepo[]).map(toRepo));
          if (repos.length >= MAX_LISTED_REPOS) break;
        }
        return repos
          .slice(0, MAX_LISTED_REPOS)
          .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
      }),

    createRepo: ({ owner, name, description, private: isPrivate = true }: CreateRepoInput) =>
      guard(async () => {
        const body = { name, description: description ?? '', private: isPrivate, auto_init: false };
        const { data } = (await isViewer(owner))
          ? await octokit.request('POST /user/repos', body)
          : await octokit.request('POST /orgs/{org}/repos', { org: owner, ...body });
        return toRepo(data);
      }),

    createInitialCommit: ({ owner, repo, branch, message, files }: InitialCommitInput) =>
      guard(async (): Promise<InitialCommitResult> => {
        checkFiles(files);
        if (!(await isEmpty(owner, repo))) throw new GitError('repo_not_empty');

        // The Git Data API refuses to work on an empty repository, so the Contents API
        // writes one file first. That bootstrap commit is replaced below by a root commit
        // holding every file, so the history starts with a single commit.
        const [first] = files as [RepoFile, ...RepoFile[]];
        const { data: bootstrap } = await octokit.request(
          'PUT /repos/{owner}/{repo}/contents/{path}',
          {
            owner,
            repo,
            path: first.path,
            branch,
            message,
            content: Buffer.from(first.content, 'utf8').toString('base64'),
          },
        );
        const bootstrapSha = bootstrap.commit.sha;
        if (!bootstrapSha) throw new GitError('bad_response');

        const tree = [];
        // Sequential on purpose: bursts of writes trigger GitHub's secondary rate limit.
        for (const file of files) {
          const { data: blob } = await octokit.request('POST /repos/{owner}/{repo}/git/blobs', {
            owner,
            repo,
            content: file.content,
            encoding: 'utf-8',
          });
          tree.push({
            path: file.path,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: blob.sha,
          });
        }

        const { data: newTree } = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
          owner,
          repo,
          tree,
        });
        const { data: commit } = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
          owner,
          repo,
          message,
          tree: newTree.sha,
          parents: [],
        });

        // Moving the branch is a force update, so it happens only while the branch still
        // points at the bootstrap commit written above: nobody else's work can be dropped.
        const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
          owner,
          repo,
          ref: `heads/${branch}`,
        });
        if (ref.object.sha !== bootstrapSha) throw new GitError('conflict');

        await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
          owner,
          repo,
          ref: `heads/${branch}`,
          sha: commit.sha,
          force: true,
        });
        return { sha: commit.sha };
      }),

    createPullRequest: ({
      owner,
      repo,
      head,
      base,
      title,
      body,
      draft = false,
    }: CreatePullRequestInput) =>
      guard(async (): Promise<PullRequestRef> => {
        const { data } = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
          owner,
          repo,
          head,
          base,
          title,
          body,
          draft,
        });
        return { number: data.number, url: data.html_url };
      }),

    listPullRequestComments: ({ owner, repo, number }: PullRequestInput) =>
      guard(async () => {
        const params = { owner, repo, per_page: 100 };
        const [issueComments, reviews, inlineComments] = await Promise.all([
          octokit.paginate('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
            ...params,
            issue_number: number,
          }),
          octokit.paginate('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
            ...params,
            pull_number: number,
          }),
          octokit.paginate('GET /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
            ...params,
            pull_number: number,
          }),
        ]);

        const comments: PullRequestComment[] = [
          ...issueComments.map((c) => ({
            kind: 'issue' as const,
            author: c.user?.login ?? null,
            body: c.body ?? '',
            path: null,
            line: null,
            createdAt: new Date(c.created_at),
            url: c.html_url,
          })),
          // A review without a summary (only inline comments or a bare approval) adds nothing.
          ...reviews
            .filter((r) => r.body && r.submitted_at)
            .map((r) => ({
              kind: 'review' as const,
              author: r.user?.login ?? null,
              body: r.body,
              path: null,
              line: null,
              createdAt: new Date(r.submitted_at as string),
              url: r.html_url,
            })),
          ...inlineComments.map((c) => ({
            kind: 'inline' as const,
            author: c.user?.login ?? null,
            body: c.body,
            path: c.path,
            line: c.line ?? c.original_line ?? null,
            createdAt: new Date(c.created_at),
            url: c.html_url,
          })),
        ];
        return comments.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }),
  };
}

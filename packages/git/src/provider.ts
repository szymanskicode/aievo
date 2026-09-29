/**
 * The only operations AIEvo performs on a Git host through its API (docs/architecture.md,
 * section 10). The token can reach every repository of the account, so the adapter is the
 * guard: there is deliberately no way to delete a repository or change its settings.
 * Adding a method here must be a visible decision, see `GIT_PROVIDER_OPERATIONS`.
 */
export interface GitProvider {
  /** Who the token authenticates as, which scopes it has and when it expires. */
  verifyToken(): Promise<TokenInfo>;
  /** The authenticated account followed by its organizations. */
  listOwners(): Promise<GitOwner[]>;
  /** Repositories of the account or of one of its organizations, sorted by name. */
  listRepos(owner: string): Promise<GitRepo[]>;
  /** One repository the token can read; `GitError('not_found')` when it cannot. */
  getRepo(owner: string, name: string): Promise<GitRepo>;
  /** Creates an empty repository; private unless stated otherwise. */
  createRepo(input: CreateRepoInput): Promise<GitRepo>;
  /** Writes the first commit, with all `files`, to an empty repository. */
  createInitialCommit(input: InitialCommitInput): Promise<InitialCommitResult>;
  createPullRequest(input: CreatePullRequestInput): Promise<PullRequestRef>;
  /** Conversation, review and inline comments of a pull request, oldest first. */
  listPullRequestComments(input: PullRequestInput): Promise<PullRequestComment[]>;
}

/**
 * Every method of `GitProvider`. A test compares it with the methods of each implementation
 * and the type of `GitProvider`, so a new operation cannot slip in unnoticed.
 */
export const GIT_PROVIDER_OPERATIONS = [
  'verifyToken',
  'listOwners',
  'listRepos',
  'getRepo',
  'createRepo',
  'createInitialCommit',
  'createPullRequest',
  'listPullRequestComments',
] as const satisfies readonly (keyof GitProvider)[];

export type TokenType = 'classic' | 'fine-grained' | 'other';

export interface TokenInfo {
  login: string;
  tokenType: TokenType;
  /** OAuth scopes of a classic token; `null` for fine-grained tokens, which have none. */
  scopes: string[] | null;
  /** Scopes a classic token lacks; always empty for other tokens (they cannot be inspected). */
  missingScopes: string[];
  /** `null` when the host reports no expiration date. */
  expiresAt: Date | null;
}

export interface GitOwner {
  login: string;
  type: 'user' | 'organization';
  avatarUrl: string | null;
}

export interface GitRepo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
}

export interface CreateRepoInput {
  owner: string;
  name: string;
  description?: string;
  /** Defaults to `true`. */
  private?: boolean;
}

export interface RepoFile {
  /** Relative path with `/` separators, e.g. `src/App.tsx`. */
  path: string;
  /** UTF-8 text; binary files are not supported. */
  content: string;
}

export interface InitialCommitInput {
  owner: string;
  repo: string;
  branch: string;
  message: string;
  files: RepoFile[];
}

export interface InitialCommitResult {
  sha: string;
}

export interface CreatePullRequestInput {
  owner: string;
  repo: string;
  /** Branch with the changes. */
  head: string;
  /** Branch the changes should be merged into. */
  base: string;
  title: string;
  body: string;
  draft?: boolean;
}

export interface PullRequestInput {
  owner: string;
  repo: string;
  number: number;
}

export interface PullRequestRef {
  number: number;
  url: string;
}

export interface PullRequestComment {
  /** `issue`: conversation tab, `review`: summary of a review, `inline`: comment on a line. */
  kind: 'issue' | 'review' | 'inline';
  author: string | null;
  body: string;
  path: string | null;
  line: number | null;
  createdAt: Date;
  url: string;
}

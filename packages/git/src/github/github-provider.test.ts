import { randomBytes } from 'node:crypto';

import { HttpResponse, http } from 'msw';
import type { JsonBodyType } from 'msw';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { GitError } from '../errors.js';
import { GIT_PROVIDER_OPERATIONS } from '../provider.js';
import type { GitProvider } from '../provider.js';
import { useMockGitHub } from '../test/msw.js';
import { MAX_LISTED_REPOS, createGitHubProvider, parseTokenExpiration } from './github-provider.js';

const server = useMockGitHub();

const API = 'https://api.github.com';
// Generated per run: fake tokens that only exist inside this test process.
const fineGrainedToken = `github_pat_${randomBytes(20).toString('hex')}`;
const classicToken = `ghp_${randomBytes(18).toString('hex')}`;

const user = { login: 'octocat', avatar_url: 'https://avatars.example/octocat' };

function repo(owner: string, name: string) {
  return {
    owner: { login: owner },
    name,
    full_name: `${owner}/${name}`,
    private: true,
    default_branch: 'main',
    description: null,
    html_url: `https://github.com/${owner}/${name}`,
  };
}

async function gitError(promise: Promise<unknown>): Promise<GitError> {
  const error = await promise.then(
    () => expect.unreachable('expected a GitError'),
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(GitError);
  const { message, kind, details, cause } = error as GitError;
  expect(cause).toBeUndefined();
  const exposed = JSON.stringify({ message, kind, details });
  expect(exposed).not.toContain(fineGrainedToken);
  expect(exposed).not.toContain(classicToken);
  return error as GitError;
}

describe('operation whitelist', () => {
  // A new operation (e.g. deleting a repository) must be a visible change in this test.
  const allowed = [
    'createInitialCommit',
    'createPullRequest',
    'createRepo',
    'listOwners',
    'listPullRequestComments',
    'listRepos',
    'verifyToken',
  ];

  it('exposes exactly the allowed operations and nothing else', () => {
    const provider = createGitHubProvider(fineGrainedToken);
    expect(Object.keys(provider).sort()).toEqual(allowed);
    expect(Object.getOwnPropertySymbols(provider)).toEqual([]);
    expect(Object.getPrototypeOf(provider)).toBe(Object.prototype);
  });

  it('matches the declared list of GitProvider operations', () => {
    expect([...GIT_PROVIDER_OPERATIONS].sort()).toEqual(allowed);
    expectTypeOf<keyof GitProvider>().toEqualTypeOf<(typeof GIT_PROVIDER_OPERATIONS)[number]>();
  });

  it('does not expose the token', () => {
    const provider = createGitHubProvider(fineGrainedToken);
    expect(JSON.stringify(provider)).not.toContain(fineGrainedToken);
  });
});

describe('verifyToken', () => {
  it('reads the login and expiration of a fine-grained token', async () => {
    let authorization: string | null = null;
    server.use(
      http.get(`${API}/user`, ({ request }) => {
        authorization = request.headers.get('authorization');
        return HttpResponse.json(user, {
          headers: { 'github-authentication-token-expiration': '2026-12-31 08:00:00 +0200' },
        });
      }),
    );

    const info = await createGitHubProvider(fineGrainedToken).verifyToken();

    expect(authorization).toBe(`token ${fineGrainedToken}`);
    expect(info).toEqual({
      login: 'octocat',
      tokenType: 'fine-grained',
      scopes: null,
      missingScopes: [],
      expiresAt: new Date('2026-12-31T06:00:00Z'),
    });
  });

  it('reports a missing expiration date as null', async () => {
    server.use(http.get(`${API}/user`, () => HttpResponse.json(user)));

    expect((await createGitHubProvider(fineGrainedToken).verifyToken()).expiresAt).toBeNull();
  });

  it('lists the scopes a classic token lacks', async () => {
    server.use(
      http.get(`${API}/user`, () =>
        HttpResponse.json(user, { headers: { 'x-oauth-scopes': 'read:org, gist' } }),
      ),
    );

    const info = await createGitHubProvider(classicToken).verifyToken();

    expect(info).toMatchObject({
      tokenType: 'classic',
      scopes: ['read:org', 'gist'],
      missingScopes: ['repo'],
    });
  });

  it('accepts a classic token with the repo scope', async () => {
    server.use(
      http.get(`${API}/user`, () =>
        HttpResponse.json(user, { headers: { 'x-oauth-scopes': 'repo, workflow' } }),
      ),
    );

    expect((await createGitHubProvider(classicToken).verifyToken()).missingScopes).toEqual([]);
  });

  it('turns 401 into an unauthorized error', async () => {
    server.use(
      http.get(`${API}/user`, () =>
        HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }),
      ),
    );

    const error = await gitError(createGitHubProvider(fineGrainedToken).verifyToken());
    expect(error.kind).toBe('unauthorized');
    expect(error.details).toEqual({ status: 401 });
  });
});

describe('parseTokenExpiration', () => {
  it('parses both formats GitHub uses and rejects anything else', () => {
    expect(parseTokenExpiration('2026-12-31 00:00:00 UTC')).toEqual(
      new Date('2026-12-31T00:00:00Z'),
    );
    expect(parseTokenExpiration('2026-12-31 00:00:00 -0130')).toEqual(
      new Date('2026-12-31T01:30:00Z'),
    );
    expect(parseTokenExpiration(undefined)).toBeNull();
    expect(parseTokenExpiration('tomorrow')).toBeNull();
    expect(parseTokenExpiration('2026-13-45 99:00:00 UTC')).toBeNull();
  });
});

describe('listOwners', () => {
  it('returns the account followed by its organizations', async () => {
    server.use(
      http.get(`${API}/user`, () => HttpResponse.json(user)),
      http.get(`${API}/user/orgs`, () => HttpResponse.json([{ login: 'acme', avatar_url: '' }])),
    );

    expect(await createGitHubProvider(fineGrainedToken).listOwners()).toEqual([
      { login: 'octocat', type: 'user', avatarUrl: 'https://avatars.example/octocat' },
      { login: 'acme', type: 'organization', avatarUrl: null },
    ]);
  });
});

describe('listRepos', () => {
  it('lists the repositories the account owns, across pages, sorted by name', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${API}/user`, () => HttpResponse.json(user)),
      http.get(`${API}/user/repos`, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url.searchParams.get('affiliation'));
        if (url.searchParams.get('page') === '2') {
          return HttpResponse.json([repo('octocat', 'alpha')]);
        }
        return HttpResponse.json([repo('octocat', 'Zeta')], {
          headers: { link: `<${API}/user/repos?affiliation=owner&page=2>; rel="next"` },
        });
      }),
    );

    const repos = await createGitHubProvider(fineGrainedToken).listRepos('OctoCat');

    expect(repos.map((r) => r.name)).toEqual(['alpha', 'Zeta']);
    expect(repos[0]).toEqual({
      owner: 'octocat',
      name: 'alpha',
      fullName: 'octocat/alpha',
      private: true,
      defaultBranch: 'main',
      description: null,
      htmlUrl: 'https://github.com/octocat/alpha',
    });
    expect(seen).toEqual(['owner', 'owner']);
  });

  it('lists the repositories of an organization', async () => {
    server.use(
      http.get(`${API}/user`, () => HttpResponse.json(user)),
      http.get(`${API}/orgs/acme/repos`, () => HttpResponse.json([repo('acme', 'site')])),
    );

    const repos = await createGitHubProvider(fineGrainedToken).listRepos('acme');

    expect(repos.map((r) => r.fullName)).toEqual(['acme/site']);
  });

  it('stops after the listing limit', async () => {
    let requests = 0;
    server.use(
      http.get(`${API}/user`, () => HttpResponse.json(user)),
      http.get(`${API}/orgs/big/repos`, ({ request }) => {
        requests += 1;
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        const data = Array.from({ length: 100 }, (_, i) => repo('big', `r${page}-${i}`));
        return HttpResponse.json(data, {
          headers: { link: `<${API}/orgs/big/repos?page=${page + 1}>; rel="next"` },
        });
      }),
    );

    const repos = await createGitHubProvider(fineGrainedToken).listRepos('big');

    expect(repos).toHaveLength(MAX_LISTED_REPOS);
    expect(requests).toBe(MAX_LISTED_REPOS / 100);
  });

  it('turns 404 into a not found error', async () => {
    server.use(
      http.get(`${API}/user`, () => HttpResponse.json(user)),
      http.get(`${API}/orgs/ghost/repos`, () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
    );

    const error = await gitError(createGitHubProvider(fineGrainedToken).listRepos('ghost'));
    expect(error.kind).toBe('not_found');
  });
});

describe('createRepo', () => {
  it('creates a private repository for the account', async () => {
    let body: JsonBodyType = null;
    server.use(
      http.get(`${API}/user`, () => HttpResponse.json(user)),
      http.post(`${API}/user/repos`, async ({ request }) => {
        body = (await request.json()) as JsonBodyType;
        return HttpResponse.json(repo('octocat', 'playground'), { status: 201 });
      }),
    );

    const created = await createGitHubProvider(fineGrainedToken).createRepo({
      owner: 'octocat',
      name: 'playground',
    });

    expect(created.fullName).toBe('octocat/playground');
    expect(body).toEqual({ name: 'playground', description: '', private: true, auto_init: false });
  });

  it('creates a repository in an organization', async () => {
    let body: JsonBodyType = null;
    server.use(
      http.get(`${API}/user`, () => HttpResponse.json(user)),
      http.post(`${API}/orgs/acme/repos`, async ({ request }) => {
        body = (await request.json()) as JsonBodyType;
        return HttpResponse.json(repo('acme', 'site'), { status: 201 });
      }),
    );

    await createGitHubProvider(fineGrainedToken).createRepo({
      owner: 'acme',
      name: 'site',
      description: 'Website',
      private: false,
    });

    expect(body).toEqual({
      name: 'site',
      description: 'Website',
      private: false,
      auto_init: false,
    });
  });

  it('reports a taken name as already existing', async () => {
    server.use(
      http.get(`${API}/user`, () => HttpResponse.json(user)),
      http.post(`${API}/user/repos`, () =>
        HttpResponse.json(
          {
            message: 'Repository creation failed.',
            errors: [
              {
                resource: 'Repository',
                field: 'name',
                message: 'name already exists on this account',
              },
            ],
          },
          { status: 422 },
        ),
      ),
    );

    const error = await gitError(
      createGitHubProvider(fineGrainedToken).createRepo({ owner: 'octocat', name: 'taken' }),
    );
    expect(error.kind).toBe('already_exists');
  });

  it('names the permission a fine-grained token lacks', async () => {
    server.use(
      http.get(`${API}/user`, () => HttpResponse.json(user)),
      http.post(`${API}/user/repos`, () =>
        HttpResponse.json(
          { message: 'Resource not accessible by personal access token' },
          {
            status: 403,
            headers: {
              'x-accepted-github-permissions': 'administration=write; bogus value',
              'x-ratelimit-remaining': '4999',
            },
          },
        ),
      ),
    );

    const error = await gitError(
      createGitHubProvider(fineGrainedToken).createRepo({ owner: 'octocat', name: 'x' }),
    );
    expect(error.kind).toBe('forbidden');
    expect(error.details).toEqual({ status: 403, requiredPermissions: ['administration=write'] });
  });
});

describe('createInitialCommit', () => {
  const input = {
    owner: 'octocat',
    repo: 'playground',
    branch: 'main',
    message: 'Initial commit from AIEvo',
    files: [
      { path: 'README.md', content: '# Playground\n' },
      { path: 'src/index.ts', content: 'export {};\n' },
    ],
  };
  const base = `${API}/repos/octocat/playground`;

  function mockEmptyRepo(options: { refSha?: string } = {}) {
    const calls: string[] = [];
    const bodies: Record<string, unknown> = {};
    const record = async (name: string, request: Request) => {
      calls.push(name);
      bodies[name] = request.method === 'GET' ? null : await request.json();
    };
    let blob = 0;
    server.use(
      http.get(`${base}/commits`, () =>
        HttpResponse.json({ message: 'Git Repository is empty.' }, { status: 409 }),
      ),
      http.put(`${base}/contents/README.md`, async ({ request }) => {
        await record('contents', request);
        return HttpResponse.json({ commit: { sha: 'bootstrap' } }, { status: 201 });
      }),
      http.post(`${base}/git/blobs`, async ({ request }) => {
        await record(`blob${blob}`, request);
        blob += 1;
        return HttpResponse.json({ sha: `blob-sha-${blob}` }, { status: 201 });
      }),
      http.post(`${base}/git/trees`, async ({ request }) => {
        await record('tree', request);
        return HttpResponse.json({ sha: 'tree-sha' }, { status: 201 });
      }),
      http.post(`${base}/git/commits`, async ({ request }) => {
        await record('commit', request);
        return HttpResponse.json({ sha: 'root-sha' }, { status: 201 });
      }),
      // Octokit encodes the slash of `heads/main` in the path.
      http.get(`${base}/git/ref/:ref`, async ({ request, params }) => {
        expect(decodeURIComponent(String(params.ref))).toBe('heads/main');
        await record('ref', request);
        return HttpResponse.json({ object: { sha: options.refSha ?? 'bootstrap' } });
      }),
      http.patch(`${base}/git/refs/:ref`, async ({ request, params }) => {
        expect(decodeURIComponent(String(params.ref))).toBe('heads/main');
        await record('update-ref', request);
        return HttpResponse.json({ object: { sha: 'root-sha' } });
      }),
    );
    return { calls, bodies };
  }

  it('writes every file in a single root commit', async () => {
    const { calls, bodies } = mockEmptyRepo();

    const result = await createGitHubProvider(fineGrainedToken).createInitialCommit(input);

    expect(result).toEqual({ sha: 'root-sha' });
    expect(calls).toEqual(['contents', 'blob0', 'blob1', 'tree', 'commit', 'ref', 'update-ref']);
    expect(bodies.contents).toMatchObject({
      branch: 'main',
      content: Buffer.from('# Playground\n').toString('base64'),
    });
    expect(bodies.blob1).toEqual({ content: 'export {};\n', encoding: 'utf-8' });
    expect(bodies.tree).toEqual({
      tree: [
        { path: 'README.md', mode: '100644', type: 'blob', sha: 'blob-sha-1' },
        { path: 'src/index.ts', mode: '100644', type: 'blob', sha: 'blob-sha-2' },
      ],
    });
    expect(bodies.commit).toEqual({
      message: 'Initial commit from AIEvo',
      tree: 'tree-sha',
      parents: [],
    });
    expect(bodies['update-ref']).toEqual({ sha: 'root-sha', force: true });
  });

  it('does not move the branch when someone else pushed in the meantime', async () => {
    const { calls } = mockEmptyRepo({ refSha: 'someone-else' });

    const error = await gitError(createGitHubProvider(fineGrainedToken).createInitialCommit(input));

    expect(error.kind).toBe('conflict');
    expect(calls).not.toContain('update-ref');
  });

  it('refuses a repository that already has commits', async () => {
    const { calls } = mockEmptyRepo();
    server.use(http.get(`${base}/commits`, () => HttpResponse.json([{ sha: 'abc' }])));

    const error = await gitError(createGitHubProvider(fineGrainedToken).createInitialCommit(input));

    expect(error.kind).toBe('repo_not_empty');
    expect(calls).toEqual([]);
  });

  it('rejects unsafe or duplicate paths before calling GitHub', async () => {
    const provider = createGitHubProvider(fineGrainedToken);
    for (const files of [
      [],
      [{ path: '../evil', content: '' }],
      [{ path: '/abs', content: '' }],
      [{ path: '.git/config', content: '' }],
      [{ path: 'a\\b', content: '' }],
      [
        { path: 'a', content: '' },
        { path: 'a', content: '' },
      ],
    ]) {
      const error = await gitError(provider.createInitialCommit({ ...input, files }));
      expect(error.kind, JSON.stringify(files)).toBe('validation');
    }
  });
});

describe('createPullRequest', () => {
  it('opens a pull request and returns its number and URL', async () => {
    let body: JsonBodyType = null;
    server.use(
      http.post(`${API}/repos/octocat/playground/pulls`, async ({ request }) => {
        body = (await request.json()) as JsonBodyType;
        return HttpResponse.json(
          { number: 7, html_url: 'https://github.com/octocat/playground/pull/7' },
          { status: 201 },
        );
      }),
    );

    const pr = await createGitHubProvider(fineGrainedToken).createPullRequest({
      owner: 'octocat',
      repo: 'playground',
      head: 'agent/1-change',
      base: 'main',
      title: 'Change',
      body: 'Details',
    });

    expect(pr).toEqual({ number: 7, url: 'https://github.com/octocat/playground/pull/7' });
    expect(body).toEqual({
      head: 'agent/1-change',
      base: 'main',
      title: 'Change',
      body: 'Details',
      draft: false,
    });
  });
});

describe('listPullRequestComments', () => {
  it('merges conversation, review and inline comments, oldest first', async () => {
    const base = `${API}/repos/octocat/playground`;
    server.use(
      http.get(`${base}/issues/7/comments`, () =>
        HttpResponse.json([
          {
            user: { login: 'alice' },
            body: 'Looks good',
            created_at: '2026-09-29T12:00:00Z',
            html_url: 'https://github.com/c/1',
          },
        ]),
      ),
      http.get(`${base}/pulls/7/reviews`, () =>
        HttpResponse.json([
          {
            user: { login: 'bob' },
            body: 'Please rename',
            submitted_at: '2026-09-29T10:00:00Z',
            html_url: 'https://github.com/r/1',
          },
          { user: { login: 'bob' }, body: '', submitted_at: '2026-09-29T10:01:00Z', html_url: 'x' },
        ]),
      ),
      http.get(`${base}/pulls/7/comments`, () =>
        HttpResponse.json([
          {
            user: null,
            body: 'Typo',
            path: 'src/a.ts',
            line: 3,
            created_at: '2026-09-29T11:00:00Z',
            html_url: 'https://github.com/i/1',
          },
        ]),
      ),
    );

    const comments = await createGitHubProvider(fineGrainedToken).listPullRequestComments({
      owner: 'octocat',
      repo: 'playground',
      number: 7,
    });

    expect(comments).toEqual([
      {
        kind: 'review',
        author: 'bob',
        body: 'Please rename',
        path: null,
        line: null,
        createdAt: new Date('2026-09-29T10:00:00Z'),
        url: 'https://github.com/r/1',
      },
      {
        kind: 'inline',
        author: null,
        body: 'Typo',
        path: 'src/a.ts',
        line: 3,
        createdAt: new Date('2026-09-29T11:00:00Z'),
        url: 'https://github.com/i/1',
      },
      {
        kind: 'issue',
        author: 'alice',
        body: 'Looks good',
        path: null,
        line: null,
        createdAt: new Date('2026-09-29T12:00:00Z'),
        url: 'https://github.com/c/1',
      },
    ]);
  });
});

describe('failures', () => {
  it('reports an exhausted primary rate limit with its reset time', async () => {
    server.use(
      http.get(`${API}/user`, () =>
        HttpResponse.json(
          { message: 'API rate limit exceeded' },
          {
            status: 403,
            headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790000000' },
          },
        ),
      ),
    );

    const error = await gitError(createGitHubProvider(fineGrainedToken).verifyToken());
    expect(error.kind).toBe('rate_limited');
    expect(error.details).toEqual({
      status: 403,
      resetAt: new Date(1790000000 * 1000).toISOString(),
    });
  });

  it('reports a secondary rate limit (429 with retry-after)', async () => {
    server.use(
      http.get(`${API}/user`, () =>
        HttpResponse.json(
          { message: 'slow down' },
          { status: 429, headers: { 'retry-after': '60' } },
        ),
      ),
    );

    const error = await gitError(createGitHubProvider(fineGrainedToken).verifyToken());
    expect(error.kind).toBe('rate_limited');
    expect(error.details.resetAt).toBeDefined();
  });

  it('reports server errors as unavailable', async () => {
    server.use(http.get(`${API}/user`, () => new HttpResponse(null, { status: 503 })));

    expect((await gitError(createGitHubProvider(fineGrainedToken).verifyToken())).kind).toBe(
      'unavailable',
    );
  });

  it('reports a network failure without details', async () => {
    server.use(http.get(`${API}/user`, () => HttpResponse.error()));

    const error = await gitError(createGitHubProvider(fineGrainedToken).verifyToken());
    expect(error.kind).toBe('network');
    expect(error.details).toEqual({});
  });

  it('reports a timeout', async () => {
    server.use(
      http.get(`${API}/user`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json(user);
      }),
    );

    const provider = createGitHubProvider(fineGrainedToken, { timeoutMs: 20 });
    expect((await gitError(provider.verifyToken())).kind).toBe('timeout');
  });

  it('uses a custom API address', async () => {
    server.use(http.get('https://github.example/api/v3/user', () => HttpResponse.json(user)));

    const provider = createGitHubProvider(fineGrainedToken, {
      baseUrl: 'https://github.example/api/v3',
    });
    expect((await provider.verifyToken()).login).toBe('octocat');
  });
});

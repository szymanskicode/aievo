import { closeTestDb } from '@aievo/db/testing';
import { githubOwnerSchema, githubRepoSchema } from '@aievo/shared';
import { createSecretBox } from '@aievo/shared/crypto';
import { HttpResponse, http } from 'msw';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { MISSING_ID, fakeGitHubToken, insertGitCredential, setupTestApp } from '../../test/app.js';
import type { TestContext } from '../../test/app.js';
import { useMockProviders } from '../../test/msw.js';

const server = useMockProviders();
const API = 'https://api.github.com';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await setupTestApp();
});

afterAll(closeTestDb);

/** Mocks the account endpoints; returns the Authorization headers GitHub received. */
function mockGitHub() {
  const seen: (string | null)[] = [];
  const auth = (req: Request) => seen.push(req.headers.get('authorization'));
  server.use(
    http.get(`${API}/user`, ({ request: req }) => {
      auth(req);
      return HttpResponse.json({ login: 'octocat', avatar_url: 'https://avatars.example/o' });
    }),
    http.get(`${API}/user/orgs`, ({ request: req }) => {
      auth(req);
      return HttpResponse.json([{ login: 'acme', avatar_url: 'https://avatars.example/a' }]);
    }),
    http.get(`${API}/user/repos`, ({ request: req }) => {
      auth(req);
      return HttpResponse.json([
        {
          owner: { login: 'octocat' },
          name: 'hello',
          full_name: 'octocat/hello',
          private: false,
          default_branch: 'main',
          description: 'Hi',
          html_url: 'https://github.com/octocat/hello',
        },
      ]);
    }),
  );
  return seen;
}

describe('GET /api/github/owners', () => {
  it('lists the account and its organizations with the only stored token', async () => {
    const token = fakeGitHubToken();
    await insertGitCredential(ctx, ctx.workspaceId, token);
    const seen = mockGitHub();

    const response = await request(ctx.app).get('/api/github/owners');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { login: 'octocat', type: 'user', avatarUrl: 'https://avatars.example/o' },
      { login: 'acme', type: 'organization', avatarUrl: 'https://avatars.example/a' },
    ]);
    expect(githubOwnerSchema.parse(response.body[0])).toBeDefined();
    expect(new Set(seen)).toEqual(new Set([`token ${token}`]));
    expect(response.text).not.toContain(token);
  });

  it('asks for a token when none is stored', async () => {
    const response = await request(ctx.app).get('/api/github/owners');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('git_credential_missing');
  });

  it('requires credentialId when several tokens are stored and uses the chosen one', async () => {
    await insertGitCredential(ctx, ctx.workspaceId, fakeGitHubToken(), 'First');
    const token = fakeGitHubToken();
    const second = await insertGitCredential(ctx, ctx.workspaceId, token, 'Second');
    const seen = mockGitHub();

    const ambiguous = await request(ctx.app).get('/api/github/owners');
    const chosen = await request(ctx.app).get(`/api/github/owners?credentialId=${second.id}`);

    expect(ambiguous.status).toBe(400);
    expect(ambiguous.body.error.code).toBe('git_credential_ambiguous');
    expect(chosen.status).toBe(200);
    expect(new Set(seen)).toEqual(new Set([`token ${token}`]));
  });

  it('never uses a token of another workspace', async () => {
    const foreign = await insertGitCredential(ctx, ctx.otherWorkspaceId, fakeGitHubToken());

    const byId = await request(ctx.app).get(`/api/github/owners?credentialId=${foreign.id}`);
    const byDefault = await request(ctx.app).get('/api/github/owners');

    expect(byId.status).toBe(404);
    expect(byId.body.error.code).toBe('not_found');
    expect(byDefault.status).toBe(409);
  });

  it('returns 404 for an unknown credential and 400 for a malformed id', async () => {
    expect(
      (await request(ctx.app).get(`/api/github/owners?credentialId=${MISSING_ID}`)).status,
    ).toBe(404);
    expect((await request(ctx.app).get('/api/github/owners?credentialId=nope')).status).toBe(400);
  });

  it('reports a stored token that cannot be decrypted as a conflict', async () => {
    await insertGitCredential(ctx, ctx.workspaceId, fakeGitHubToken());
    const app = createApp({
      db: ctx.db,
      secretBox: createSecretBox(Buffer.alloc(32, 7)),
      resolveWorkspace: () => ctx.workspaceId,
    });

    const response = await request(app).get('/api/github/owners');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('git_token_unreadable');
  });

  it('turns a revoked token into a readable error', async () => {
    await insertGitCredential(ctx, ctx.workspaceId, fakeGitHubToken());
    server.use(
      http.get(`${API}/user`, () =>
        HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }),
      ),
    );

    const response = await request(ctx.app).get('/api/github/owners');

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'git_auth_failed',
      message: 'GitHub rejected the token; it may be invalid, revoked or expired',
      details: { githubStatus: 401 },
    });
  });
});

describe('GET /api/github/repos', () => {
  it('lists the repositories of the account', async () => {
    await insertGitCredential(ctx, ctx.workspaceId, fakeGitHubToken());
    mockGitHub();

    const response = await request(ctx.app).get('/api/github/repos?owner=octocat');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        owner: 'octocat',
        name: 'hello',
        fullName: 'octocat/hello',
        private: false,
        defaultBranch: 'main',
        description: 'Hi',
        htmlUrl: 'https://github.com/octocat/hello',
      },
    ]);
    expect(githubRepoSchema.parse(response.body[0])).toBeDefined();
  });

  it('reports an unknown organization as not found', async () => {
    await insertGitCredential(ctx, ctx.workspaceId, fakeGitHubToken());
    mockGitHub();
    server.use(
      http.get(`${API}/orgs/ghost/repos`, () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
    );

    const response = await request(ctx.app).get('/api/github/repos?owner=ghost');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('git_not_found');
  });

  it('requires a valid owner', async () => {
    for (const query of ['', '?owner=', '?owner=../etc']) {
      const response = await request(ctx.app).get(`/api/github/repos${query}`);
      expect(response.status, query).toBe(400);
      expect(response.body.error.code).toBe('validation_error');
    }
  });
});

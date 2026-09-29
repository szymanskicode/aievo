import { getGitCredential } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { createdGitCredentialSchema, gitCredentialSchema } from '@aievo/shared';
import { HttpResponse, http } from 'msw';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createLogger } from '../../logger.js';
import {
  MISSING_ID,
  fakeGitHubToken,
  insertGitCredential,
  insertProject,
  linkProjectToCredential,
  setupTestApp,
} from '../../test/app.js';
import type { TestContext } from '../../test/app.js';
import { useMockProviders } from '../../test/msw.js';

const server = useMockProviders();
const GITHUB_USER = 'https://api.github.com/user';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await setupTestApp();
});

afterAll(closeTestDb);

/**
 * Asserts that nothing from the token or its stored form appears in a response:
 * not the token, not its prefix (everything but the 4-character hint), not the ciphertext.
 */
async function expectNoSecrets(text: string, token: string, credentialId?: string) {
  expect(text).not.toContain(token);
  expect(text).not.toContain(token.slice(0, -4));
  expect(text).not.toMatch(/encryptedToken|encrypted_token|"token"/);
  expect(text).not.toMatch(/v1:[A-Za-z0-9+/=]+:/);
  if (credentialId) {
    const stored = await getGitCredential(ctx.db, ctx.workspaceId, credentialId);
    for (const part of stored?.encryptedToken.split(':').slice(1) ?? []) {
      expect(text).not.toContain(part);
    }
  }
}

function mockGitHubUser(headers: Record<string, string> = {}) {
  const seen: (string | null)[] = [];
  server.use(
    http.get(GITHUB_USER, ({ request: req }) => {
      seen.push(req.headers.get('authorization'));
      return HttpResponse.json({ login: 'octocat', avatar_url: '' }, { headers });
    }),
  );
  return seen;
}

describe('POST /api/git-credentials', () => {
  it('checks the token with GitHub and stores it encrypted', async () => {
    const token = fakeGitHubToken();
    const seen = mockGitHubUser({
      'github-authentication-token-expiration': '2026-12-31 00:00:00 UTC',
    });

    const response = await request(ctx.app)
      .post('/api/git-credentials')
      .send({ label: 'Personal', token });

    expect(response.status).toBe(201);
    expect(seen).toEqual([`token ${token}`]);
    expect(createdGitCredentialSchema.parse(response.body)).toMatchObject({
      provider: 'github',
      label: 'Personal',
      githubLogin: 'octocat',
      tokenHint: token.slice(-4),
      expiresAt: '2026-12-31T00:00:00.000Z',
    });
    // Fine-grained permissions cannot be read from GitHub, so the user is told what to check.
    expect(response.body.warnings).toEqual([expect.stringContaining('Pull requests')]);
    await expectNoSecrets(response.text, token, response.body.id);

    const stored = await getGitCredential(ctx.db, ctx.workspaceId, response.body.id);
    expect(stored?.encryptedToken).not.toContain(token);
    expect(ctx.secretBox.decrypt(stored!.encryptedToken)).toBe(token);
  });

  it('warns about a token without an expiration date', async () => {
    mockGitHubUser();

    const response = await request(ctx.app)
      .post('/api/git-credentials')
      .send({ label: 'GitHub', token: fakeGitHubToken() });

    expect(response.status).toBe(201);
    expect(response.body.expiresAt).toBeNull();
    expect(response.body.warnings).toContainEqual(expect.stringContaining('expiration date'));
  });

  it('refuses a classic token without the repo scope and names the missing scope', async () => {
    const token = `ghp_${'a'.repeat(36)}`;
    mockGitHubUser({ 'x-oauth-scopes': 'read:user' });

    const response = await request(ctx.app)
      .post('/api/git-credentials')
      .send({ label: 'Classic', token });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'git_token_insufficient',
      message: 'The token lacks required scopes: repo',
      details: { missingScopes: ['repo'] },
    });
    expect(response.text).not.toContain(token);
    expect((await request(ctx.app).get('/api/git-credentials')).body).toEqual([]);
  });

  it('accepts a classic token with the repo scope without a permissions warning', async () => {
    mockGitHubUser({
      'x-oauth-scopes': 'repo',
      'github-authentication-token-expiration': '2026-12-31 00:00:00 UTC',
    });

    const response = await request(ctx.app)
      .post('/api/git-credentials')
      .send({ label: 'Classic', token: `ghp_${'b'.repeat(36)}` });

    expect(response.status).toBe(201);
    expect(response.body.warnings).toEqual([]);
  });

  it('refuses a token GitHub rejects and stores nothing', async () => {
    const token = fakeGitHubToken();
    server.use(
      http.get(GITHUB_USER, () =>
        HttpResponse.json({ message: `Bad credentials ${token}` }, { status: 401 }),
      ),
    );

    const response = await request(ctx.app)
      .post('/api/git-credentials')
      .send({ label: 'GitHub', token });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('git_auth_failed');
    expect(response.text).not.toContain(token);
    expect((await request(ctx.app).get('/api/git-credentials')).body).toEqual([]);
  });

  it('reports the GitHub rate limit with its reset time', async () => {
    server.use(
      http.get(GITHUB_USER, () =>
        HttpResponse.json(
          { message: 'API rate limit exceeded' },
          {
            status: 403,
            headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790000000' },
          },
        ),
      ),
    );

    const response = await request(ctx.app)
      .post('/api/git-credentials')
      .send({ label: 'GitHub', token: fakeGitHubToken() });

    expect(response.status).toBe(429);
    expect(response.body.error).toMatchObject({
      code: 'git_rate_limited',
      details: { githubStatus: 403, resetAt: new Date(1790000000 * 1000).toISOString() },
    });
  });

  it('validates the body without echoing the token', async () => {
    const token = fakeGitHubToken();

    const response = await request(ctx.app)
      .post('/api/git-credentials')
      .send({ label: '', token, extra: true });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
    expect(response.text).not.toContain(token);
  });

  it('keeps the token out of the logs, also when GitHub fails', async () => {
    const token = fakeGitHubToken();
    const written: string[] = [];
    const logger = createLogger('trace', { write: (chunk: string) => void written.push(chunk) });
    const app = createApp({
      db: ctx.db,
      secretBox: ctx.secretBox,
      logger,
      resolveWorkspace: () => ctx.workspaceId,
    });
    server.use(http.get(GITHUB_USER, () => new HttpResponse(null, { status: 503 })));

    const failed = await request(app).post('/api/git-credentials').send({ label: 'G', token });
    mockGitHubUser();
    const stored = await request(app).post('/api/git-credentials').send({ label: 'G', token });

    expect(failed.status).toBe(502);
    expect(stored.status).toBe(201);
    const logs = written.join('');
    expect(logs).toContain('Request failed');
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(token.slice(0, -4));
  });
});

describe('GET /api/git-credentials', () => {
  it('lists the credentials of the workspace only, without tokens', async () => {
    const token = fakeGitHubToken();
    const own = await insertGitCredential(ctx, ctx.workspaceId, token);
    await insertGitCredential(ctx, ctx.otherWorkspaceId, fakeGitHubToken(), 'Foreign');

    const response = await request(ctx.app).get('/api/git-credentials');

    expect(response.status).toBe(200);
    expect(response.body.map((c: { id: string }) => c.id)).toEqual([own.id]);
    expect(gitCredentialSchema.strict().parse(response.body[0])).toBeDefined();
    await expectNoSecrets(response.text, token, own.id);
  });
});

describe('DELETE /api/git-credentials/:id', () => {
  it('deletes a credential', async () => {
    const credential = await insertGitCredential(ctx, ctx.workspaceId, fakeGitHubToken());

    const response = await request(ctx.app).delete(`/api/git-credentials/${credential.id}`);

    expect(response.status).toBe(204);
    expect(await getGitCredential(ctx.db, ctx.workspaceId, credential.id)).toBeNull();
  });

  it('returns 404 for unknown ids and credentials of another workspace', async () => {
    const foreign = await insertGitCredential(ctx, ctx.otherWorkspaceId, fakeGitHubToken());

    for (const id of [MISSING_ID, foreign.id]) {
      const response = await request(ctx.app).delete(`/api/git-credentials/${id}`);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    }
    expect(await getGitCredential(ctx.db, ctx.otherWorkspaceId, foreign.id)).not.toBeNull();
  });

  it('refuses to delete a credential that a project uses', async () => {
    const credential = await insertGitCredential(ctx, ctx.workspaceId, fakeGitHubToken());
    const used = await insertProject(ctx.db, ctx.workspaceId);
    await linkProjectToCredential(ctx.db, used.id, credential.id);

    const response = await request(ctx.app).delete(`/api/git-credentials/${credential.id}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('git_credential_in_use');
  });
});

import { deleteGitCredential, listProjects } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { DEFAULT_NPM_COMMANDS, projectSchema } from '@aievo/shared';
import { HttpResponse, http } from 'msw';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { fakeGitHubToken, insertGitCredential, setupTestApp } from '../../test/app.js';
import type { TestContext } from '../../test/app.js';
import { useMockProviders } from '../../test/msw.js';

const server = useMockProviders();
const API = 'https://api.github.com';

let ctx: TestContext;
let token: string;
let credentialId: string;

beforeEach(async () => {
  ctx = await setupTestApp();
  token = fakeGitHubToken();
  credentialId = (await insertGitCredential(ctx, ctx.workspaceId, token)).id;
});

afterAll(closeTestDb);

function rawRepo(name: string, owner = 'octocat') {
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

/** The token owner, so `createRepo` uses the `/user/repos` endpoint. */
function mockViewer() {
  server.use(http.get(`${API}/user`, () => HttpResponse.json({ login: 'octocat' })));
}

describe('POST /api/projects with mode "existing"', () => {
  const body = {
    mode: 'existing',
    owner: 'octocat',
    repo: 'Hello',
    defaultBranch: 'develop',
    commands: DEFAULT_NPM_COMMANDS,
  };

  /** GitHub answers for `Hello` with the canonical spelling of the name. */
  function mockRepo() {
    server.use(http.get(`${API}/repos/octocat/Hello`, () => HttpResponse.json(rawRepo('hello'))));
  }

  it('links the repository without detecting the stack', async () => {
    mockRepo();

    const response = await request(ctx.app).post('/api/projects').send(body);

    expect(response.status).toBe(201);
    expect(projectSchema.parse(response.body)).toMatchObject({
      name: 'hello',
      repoUrl: 'https://github.com/octocat/hello',
      repoOwner: 'octocat',
      repoName: 'hello',
      gitCredentialId: credentialId,
      defaultBranch: 'develop',
      settings: { commands: DEFAULT_NPM_COMMANDS },
    });
    expect(response.text).not.toContain(token);
  });

  it('keeps a project name given in the wizard', async () => {
    mockRepo();

    const response = await request(ctx.app)
      .post('/api/projects')
      .send({ ...body, name: 'Hello app', commands: undefined });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: 'Hello app', settings: { commands: {} } });
  });

  it('answers 404 when the token cannot see the repository', async () => {
    server.use(
      http.get(`${API}/repos/octocat/Hello`, () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
    );

    const response = await request(ctx.app).post('/api/projects').send(body);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('git_repo_not_found');
    expect(await listProjects(ctx.db, ctx.workspaceId)).toEqual([]);
  });

  it('refuses a repository that another project already uses', async () => {
    mockRepo();
    await request(ctx.app).post('/api/projects').send(body).expect(201);

    const response = await request(ctx.app)
      .post('/api/projects')
      .send({ ...body, name: 'Second' });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'project_repo_taken',
      message: 'Repository octocat/hello is already linked to another project',
    });
    expect(await listProjects(ctx.db, ctx.workspaceId)).toHaveLength(1);
  });

  it('asks for a token when the workspace has none', async () => {
    const other = await setupTestApp();

    const response = await request(other.app).post('/api/projects').send(body);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('git_credential_missing');
  });

  it('does not use a credential of another workspace', async () => {
    const foreign = await insertGitCredential(ctx, ctx.otherWorkspaceId, fakeGitHubToken());

    const response = await request(ctx.app)
      .post('/api/projects')
      .send({ ...body, credentialId: foreign.id });

    expect(response.status).toBe(404);
    expect(await listProjects(ctx.db, ctx.workspaceId)).toEqual([]);
    expect(await listProjects(ctx.db, ctx.otherWorkspaceId)).toEqual([]);
  });
});

describe('POST /api/projects with mode "new"', () => {
  const body = {
    mode: 'new',
    name: 'aievo-playground',
    description: 'Playground for agents',
    owner: 'octocat',
    template: 'react-vite-ts',
  };
  const repoApi = `${API}/repos/octocat/aievo-playground`;

  /** An empty repository after `POST /user/repos`; records every GitHub call in order. */
  function mockNewRepo(options: { failBlob?: boolean; repoExists?: boolean } = {}) {
    const calls: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    let blobs = 0;
    mockViewer();
    server.use(
      http.post(`${API}/user/repos`, async ({ request: req }) => {
        calls.push('create-repo');
        bodies.push((await req.json()) as Record<string, unknown>);
        if (options.repoExists) {
          return HttpResponse.json(
            {
              message: 'Repository creation failed.',
              errors: [{ message: 'name already exists on this account' }],
            },
            { status: 422 },
          );
        }
        return HttpResponse.json(rawRepo('aievo-playground'), { status: 201 });
      }),
      http.get(`${repoApi}/commits`, () =>
        HttpResponse.json({ message: 'Git Repository is empty.' }, { status: 409 }),
      ),
      http.put(`${repoApi}/contents/*`, () => {
        calls.push('contents');
        return HttpResponse.json({ commit: { sha: 'bootstrap' } }, { status: 201 });
      }),
      http.post(`${repoApi}/git/blobs`, async ({ request: req }) => {
        if (options.failBlob) return HttpResponse.json({ message: 'Boom' }, { status: 500 });
        blobs += 1;
        if (blobs === 1) calls.push('blobs');
        bodies.push((await req.json()) as Record<string, unknown>);
        return HttpResponse.json({ sha: `blob-${blobs}` }, { status: 201 });
      }),
      http.post(`${repoApi}/git/trees`, () => {
        calls.push('tree');
        return HttpResponse.json({ sha: 'tree-sha' }, { status: 201 });
      }),
      http.post(`${repoApi}/git/commits`, async ({ request: req }) => {
        calls.push('commit');
        bodies.push((await req.json()) as Record<string, unknown>);
        return HttpResponse.json({ sha: 'root-sha' }, { status: 201 });
      }),
      http.get(`${repoApi}/git/ref/:ref`, () => {
        calls.push('ref');
        return HttpResponse.json({ object: { sha: 'bootstrap' } });
      }),
      http.patch(`${repoApi}/git/refs/:ref`, () => {
        calls.push('update-ref');
        return HttpResponse.json({ object: { sha: 'root-sha' } });
      }),
    );
    return { calls, bodies, blobCount: () => blobs };
  }

  it('creates the repository, commits the template once and saves the project', async () => {
    const github = mockNewRepo();

    const response = await request(ctx.app).post('/api/projects').send(body);

    expect(response.status).toBe(201);
    expect(github.calls).toEqual([
      'create-repo',
      'contents',
      'blobs',
      'tree',
      'commit',
      'ref',
      'update-ref',
    ]);
    expect(github.bodies[0]).toMatchObject({
      name: 'aievo-playground',
      description: 'Playground for agents',
      private: true,
      auto_init: false,
    });
    expect(github.blobCount()).toBeGreaterThan(5);
    const contents = github.bodies.map((entry) => String(entry.content ?? ''));
    expect(contents.some((text) => text.includes('"name": "aievo-playground"'))).toBe(true);
    expect(contents.some((text) => text.includes('{{'))).toBe(false);
    expect(github.bodies.at(-1)).toMatchObject({ parents: [], tree: 'tree-sha' });

    expect(projectSchema.parse(response.body)).toMatchObject({
      name: 'aievo-playground',
      description: 'Playground for agents',
      repoUrl: 'https://github.com/octocat/aievo-playground',
      repoOwner: 'octocat',
      repoName: 'aievo-playground',
      gitCredentialId: credentialId,
      defaultBranch: 'main',
      settings: {
        commands: {
          install: 'npm install',
          test: 'npm test',
          coverage: 'npm run test:coverage',
        },
        preview: { port: 5173, readyPath: '/' },
      },
      testPolicy: {
        framework: 'vitest',
        commands: { test: 'npm test', coverage: 'npm run test:coverage' },
        changedLines: { minLineCoverage: 80 },
      },
    });
  });

  it('creates a public repository from the empty template when asked', async () => {
    const github = mockNewRepo();

    const response = await request(ctx.app)
      .post('/api/projects')
      .send({ ...body, template: 'empty', private: false });

    expect(response.status).toBe(201);
    expect(github.bodies[0]).toMatchObject({ private: false });
    expect(github.blobCount()).toBe(2);
    expect(response.body.settings).toEqual({ commands: {} });
  });

  it('keeps the repository and saves nothing when the initial commit fails', async () => {
    mockNewRepo({ failBlob: true });

    const response = await request(ctx.app).post('/api/projects').send(body);

    expect(response.status).toBe(502);
    expect(response.body.error).toMatchObject({
      code: 'project_setup_failed',
      details: {
        repoUrl: 'https://github.com/octocat/aievo-playground',
        step: 'initial_commit',
        cause: 'git_unavailable',
      },
    });
    expect(response.body.error.message).toContain('octocat/aievo-playground was created');
    expect(await listProjects(ctx.db, ctx.workspaceId)).toEqual([]);
  });

  it('keeps the repository and links it when the project cannot be saved', async () => {
    const github = mockNewRepo();
    // The token is deleted (e.g. in another tab) while GitHub finishes the commit, so the
    // project can no longer reference it.
    server.use(
      http.patch(`${repoApi}/git/refs/:ref`, async () => {
        await deleteGitCredential(ctx.db, ctx.workspaceId, credentialId);
        return HttpResponse.json({ object: { sha: 'root-sha' } });
      }),
    );

    const response = await request(ctx.app).post('/api/projects').send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'project_setup_failed',
      details: {
        repoUrl: 'https://github.com/octocat/aievo-playground',
        step: 'save_project',
        cause: 'invalid_reference',
      },
    });
    expect(response.body.error.message).toContain('the project could not be saved');
    expect(github.calls).toContain('commit');
    expect(await listProjects(ctx.db, ctx.workspaceId)).toEqual([]);
  });

  it('answers 409 when the repository name is taken', async () => {
    const github = mockNewRepo({ repoExists: true });

    const response = await request(ctx.app).post('/api/projects').send(body);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('git_already_exists');
    expect(github.calls).toEqual(['create-repo']);
  });

  it('rejects an unknown template before calling GitHub', async () => {
    const response = await request(ctx.app)
      .post('/api/projects')
      .send({ ...body, template: 'missing' });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      expect.objectContaining({ path: ['body', 'template'], message: 'Unknown template' }),
    ]);
  });
});

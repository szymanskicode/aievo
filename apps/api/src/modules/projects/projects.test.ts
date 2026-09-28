import { getProject } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { projectSchema, testPolicySchema } from '@aievo/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { MISSING_ID, insertProject, setupTestApp } from '../../test/app.js';
import type { TestContext } from '../../test/app.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await setupTestApp();
});

afterAll(closeTestDb);

describe('GET /api/projects', () => {
  it('lists projects of the current workspace only', async () => {
    const own = await insertProject(ctx.db, ctx.workspaceId, 'Own');
    await insertProject(ctx.db, ctx.otherWorkspaceId, 'Foreign');

    const response = await request(ctx.app).get('/api/projects');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ id: own.id, name: 'Own' });
    expect(projectSchema.safeParse(response.body[0]).success).toBe(true);
  });

  it('does not expose the workspace id', async () => {
    await insertProject(ctx.db, ctx.workspaceId);

    const response = await request(ctx.app).get('/api/projects');

    expect(response.body[0]).not.toHaveProperty('workspaceId');
  });
});

describe('POST /api/projects', () => {
  it('creates a project with defaults', async () => {
    const response = await request(ctx.app).post('/api/projects').send({ name: '  Demo  ' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Demo',
      description: '',
      repoUrl: null,
      defaultBranch: 'main',
      settings: { commands: {} },
      testPolicy: testPolicySchema.parse({}),
    });
    expect(await getProject(ctx.db, ctx.workspaceId, response.body.id)).not.toBeNull();
  });

  it('rejects a missing name with 400 in the error format', async () => {
    const response = await request(ctx.app).post('/api/projects').send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'validation_error',
        message: 'Request validation failed',
        details: [expect.objectContaining({ path: ['body', 'name'] })],
      },
    });
  });

  it('rejects unknown fields instead of ignoring them', async () => {
    const response = await request(ctx.app)
      .post('/api/projects')
      .send({ name: 'Demo', workspaceId: ctx.otherWorkspaceId });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
  });

  it('rejects a body that is not JSON with 415', async () => {
    const response = await request(ctx.app)
      .post('/api/projects')
      .set('Content-Type', 'text/plain')
      .send('name=Demo');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({
      error: { code: 'unsupported_media_type', message: 'Request body must be JSON' },
    });
  });

  it('rejects a request without a body with 415', async () => {
    const response = await request(ctx.app).post('/api/projects');

    expect(response.status).toBe(415);
  });

  it('does not echo rejected values back', async () => {
    const response = await request(ctx.app)
      .post('/api/projects')
      .send({ name: 'Demo', repoUrl: 'ftp://secret-host.example' });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain('secret-host');
  });
});

describe('GET /api/projects/:id', () => {
  it('returns the project', async () => {
    const project = await insertProject(ctx.db, ctx.workspaceId);

    const response = await request(ctx.app).get(`/api/projects/${project.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: project.id,
      name: 'Demo',
      createdAt: project.createdAt.toISOString(),
    });
  });

  it('answers 404 for a missing project', async () => {
    const response = await request(ctx.app).get(`/api/projects/${MISSING_ID}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'not_found', message: 'Project not found' } });
  });

  it('answers 400 for an id that is not a UUID', async () => {
    const response = await request(ctx.app).get('/api/projects/42');

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toEqual(['params', 'id']);
  });
});

describe('PATCH /api/projects/:id', () => {
  it('updates only the provided fields', async () => {
    const project = await insertProject(ctx.db, ctx.workspaceId);
    await request(ctx.app)
      .patch(`/api/projects/${project.id}`)
      .send({ settings: { commands: { test: 'pnpm test' } } })
      .expect(200);

    const response = await request(ctx.app)
      .patch(`/api/projects/${project.id}`)
      .send({ name: 'Renamed', repoUrl: 'https://github.com/acme/demo' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: 'Renamed',
      repoUrl: 'https://github.com/acme/demo',
      settings: { commands: { test: 'pnpm test' } },
    });
  });

  it('answers 404 for a missing project', async () => {
    const response = await request(ctx.app)
      .patch(`/api/projects/${MISSING_ID}`)
      .send({ name: 'X' });

    expect(response.status).toBe(404);
  });

  it('rejects an invalid value with 400', async () => {
    const project = await insertProject(ctx.db, ctx.workspaceId);

    const response = await request(ctx.app)
      .patch(`/api/projects/${project.id}`)
      .send({ name: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
  });
});

describe('DELETE /api/projects/:id', () => {
  it('deletes the project', async () => {
    const project = await insertProject(ctx.db, ctx.workspaceId);

    const response = await request(ctx.app).delete(`/api/projects/${project.id}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(await getProject(ctx.db, ctx.workspaceId, project.id)).toBeNull();
  });

  it('answers 404 for a missing project', async () => {
    const response = await request(ctx.app).delete(`/api/projects/${MISSING_ID}`);

    expect(response.status).toBe(404);
  });
});

describe('projects of another workspace', () => {
  it('answer 404 and stay unchanged', async () => {
    const foreign = await insertProject(ctx.db, ctx.otherWorkspaceId, 'Foreign');
    const url = `/api/projects/${foreign.id}`;

    const responses = [
      await request(ctx.app).get(url),
      await request(ctx.app).patch(url).send({ name: 'Hacked' }),
      await request(ctx.app).delete(url),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'not_found', message: 'Project not found' } });
    }
    expect(await getProject(ctx.db, ctx.otherWorkspaceId, foreign.id)).toEqual(foreign);
  });
});

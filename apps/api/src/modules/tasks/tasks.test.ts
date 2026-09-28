import { getTask, listTasks } from '@aievo/db';
import type { Project } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { taskSchema } from '@aievo/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { MISSING_ID, insertProject, insertTask, setupTestApp } from '../../test/app.js';
import type { TestContext } from '../../test/app.js';

let ctx: TestContext;
let project: Project;

beforeEach(async () => {
  ctx = await setupTestApp();
  project = await insertProject(ctx.db, ctx.workspaceId);
});

afterAll(closeTestDb);

describe('GET /api/projects/:id/tasks', () => {
  it('lists tasks in board order', async () => {
    const first = await insertTask(ctx.db, ctx.workspaceId, project.id, 'First');
    const second = await insertTask(ctx.db, ctx.workspaceId, project.id, 'Second');

    const response = await request(ctx.app).get(`/api/projects/${project.id}/tasks`);

    expect(response.status).toBe(200);
    expect(response.body.map((t: { id: string }) => t.id)).toEqual([first.id, second.id]);
    expect(taskSchema.safeParse(response.body[0]).success).toBe(true);
  });

  it('filters by status', async () => {
    await insertTask(ctx.db, ctx.workspaceId, project.id, 'Draft');
    const ready = await request(ctx.app)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Ready', status: 'ready' });

    const response = await request(ctx.app).get(`/api/projects/${project.id}/tasks?status=ready`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([ready.body]);
  });

  it('rejects an unknown status with 400', async () => {
    const response = await request(ctx.app).get(
      `/api/projects/${project.id}/tasks?status=archived`,
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toEqual(['query', 'status']);
  });

  it('answers 404 for a missing project instead of an empty list', async () => {
    const response = await request(ctx.app).get(`/api/projects/${MISSING_ID}/tasks`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });
});

describe('POST /api/projects/:id/tasks', () => {
  it('creates a task at the end of the project', async () => {
    await insertTask(ctx.db, ctx.workspaceId, project.id, 'Existing');

    const response = await request(ctx.app)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'New', type: 'bug', priority: 'high', labels: ['ui'] });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      projectId: project.id,
      title: 'New',
      type: 'bug',
      priority: 'high',
      status: 'draft',
      labels: ['ui'],
      position: 2,
      parentId: null,
    });
    expect(await getTask(ctx.db, ctx.workspaceId, response.body.id)).not.toBeNull();
  });

  it('rejects a blank title with 400', async () => {
    const response = await request(ctx.app)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: '  ' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'validation_error',
      details: [expect.objectContaining({ path: ['body', 'title'] })],
    });
  });

  it('rejects a parent from another project with 400 invalid_reference', async () => {
    const otherProject = await insertProject(ctx.db, ctx.workspaceId, 'Other');
    const foreignParent = await insertTask(ctx.db, ctx.workspaceId, otherProject.id);

    const response = await request(ctx.app)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Child', parentId: foreignParent.id });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_reference');
  });

  it('answers 404 for a missing project', async () => {
    const response = await request(ctx.app)
      .post(`/api/projects/${MISSING_ID}/tasks`)
      .send({ title: 'Lost' });

    expect(response.status).toBe(404);
  });
});

describe('GET /api/tasks/:id', () => {
  it('returns the task', async () => {
    const task = await insertTask(ctx.db, ctx.workspaceId, project.id, 'Mine');

    const response = await request(ctx.app).get(`/api/tasks/${task.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: task.id, title: 'Mine' });
  });

  it('answers 404 for a missing task', async () => {
    const response = await request(ctx.app).get(`/api/tasks/${MISSING_ID}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'not_found', message: 'Task not found' } });
  });

  it('answers 400 for an id that is not a UUID', async () => {
    const response = await request(ctx.app).get('/api/tasks/not-a-uuid');

    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('moves a task on the board', async () => {
    const task = await insertTask(ctx.db, ctx.workspaceId, project.id);

    const response = await request(ctx.app)
      .patch(`/api/tasks/${task.id}`)
      .send({ status: 'ready', position: 1.5 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ready', position: 1.5, title: 'Task' });
  });

  it('updates task fields', async () => {
    const task = await insertTask(ctx.db, ctx.workspaceId, project.id);

    const response = await request(ctx.app)
      .patch(`/api/tasks/${task.id}`)
      .send({ title: 'Renamed', description: 'Details', labels: ['api'] });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      title: 'Renamed',
      description: 'Details',
      labels: ['api'],
    });
  });

  it('rejects a form-encoded body with 415', async () => {
    const task = await insertTask(ctx.db, ctx.workspaceId, project.id);

    const response = await request(ctx.app)
      .patch(`/api/tasks/${task.id}`)
      .type('form')
      .send({ status: 'done' });

    expect(response.status).toBe(415);
    expect(await getTask(ctx.db, ctx.workspaceId, task.id)).toMatchObject({ status: 'draft' });
  });

  it('rejects an unknown status with 400', async () => {
    const task = await insertTask(ctx.db, ctx.workspaceId, project.id);

    const response = await request(ctx.app).patch(`/api/tasks/${task.id}`).send({ status: 'x' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
  });

  it('rejects making a task its own parent', async () => {
    const task = await insertTask(ctx.db, ctx.workspaceId, project.id);

    const response = await request(ctx.app)
      .patch(`/api/tasks/${task.id}`)
      .send({ parentId: task.id });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_reference');
  });

  it('answers 404 for a missing task', async () => {
    const response = await request(ctx.app)
      .patch(`/api/tasks/${MISSING_ID}`)
      .send({ status: 'done' });

    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('deletes the task', async () => {
    const task = await insertTask(ctx.db, ctx.workspaceId, project.id);

    const response = await request(ctx.app).delete(`/api/tasks/${task.id}`);

    expect(response.status).toBe(204);
    expect(await getTask(ctx.db, ctx.workspaceId, task.id)).toBeNull();
  });

  it('answers 404 for a missing task', async () => {
    const response = await request(ctx.app).delete(`/api/tasks/${MISSING_ID}`);

    expect(response.status).toBe(404);
  });
});

describe('tasks of another workspace', () => {
  it('answer 404 and stay unchanged', async () => {
    const foreignProject = await insertProject(ctx.db, ctx.otherWorkspaceId, 'Foreign');
    const foreignTask = await insertTask(ctx.db, ctx.otherWorkspaceId, foreignProject.id);
    const taskUrl = `/api/tasks/${foreignTask.id}`;
    const listUrl = `/api/projects/${foreignProject.id}/tasks`;

    const responses = [
      await request(ctx.app).get(taskUrl),
      await request(ctx.app).patch(taskUrl).send({ status: 'done' }),
      await request(ctx.app).delete(taskUrl),
      await request(ctx.app).get(listUrl),
      await request(ctx.app).post(listUrl).send({ title: 'Injected' }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    }
    expect(await getTask(ctx.db, ctx.otherWorkspaceId, foreignTask.id)).toEqual(foreignTask);
    expect(
      await listTasks(ctx.db, ctx.otherWorkspaceId, { projectId: foreignProject.id }),
    ).toHaveLength(1);
  });

  it('cannot be used as a parent', async () => {
    const foreignProject = await insertProject(ctx.db, ctx.otherWorkspaceId, 'Foreign');
    const foreignTask = await insertTask(ctx.db, ctx.otherWorkspaceId, foreignProject.id);

    const response = await request(ctx.app)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Child', parentId: foreignTask.id });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_reference');
  });
});

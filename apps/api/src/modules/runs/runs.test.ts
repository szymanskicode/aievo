import {
  claimRun,
  finishRun,
  getRun,
  getTask,
  updateModel,
  updateProject,
  updateWorkspaceSettings,
} from '@aievo/db';
import type { Model, Project, Task } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { runSchema } from '@aievo/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import {
  MISSING_ID,
  fakeGitHubToken,
  insertGitCredential,
  insertLinkedProject,
  insertModel,
  insertProject,
  insertTask,
  setupTestApp,
} from '../../test/app.js';
import type { TestContext } from '../../test/app.js';

let ctx: TestContext;
let project: Project;
let task: Task;
let coderModel: Model;

beforeEach(async () => {
  ctx = await setupTestApp();
  const credential = await insertGitCredential(ctx, ctx.workspaceId, fakeGitHubToken());
  project = await insertLinkedProject(ctx.db, ctx.workspaceId, credential.id);
  await updateProject(ctx.db, ctx.workspaceId, project.id, {
    settings: { commands: { install: 'npm ci', test: 'npm test' } },
  });
  task = await insertTask(ctx.db, ctx.workspaceId, project.id, 'Fix login');
  // A run needs a model for the Programista (prompt 5 of stage 2).
  coderModel = await insertModel(ctx, ctx.workspaceId);
  await updateWorkspaceSettings(ctx.db, ctx.workspaceId, { agentModels: { coder: coderModel.id } });
});

afterAll(closeTestDb);

const startRun = (taskId = task.id) => request(ctx.app).post(`/api/tasks/${taskId}/runs`);

describe('POST /api/tasks/:id/runs', () => {
  it('queues a run and hands it to the worker', async () => {
    const response = await startRun();

    expect(response.status).toBe(201);
    expect(runSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({
      taskId: task.id,
      status: 'queued',
      branch: null,
      error: null,
      cancelRequestedAt: null,
    });
    expect(ctx.queue.enqueued).toEqual([response.body.id]);
  });

  it('answers 404 for a missing task and a task of another workspace', async () => {
    const theirProject = await insertProject(ctx.db, ctx.otherWorkspaceId);
    const theirTask = await insertTask(ctx.db, ctx.otherWorkspaceId, theirProject.id);

    expect((await startRun(MISSING_ID)).status).toBe(404);
    expect((await startRun(theirTask.id)).status).toBe(404);
    expect(ctx.queue.enqueued).toEqual([]);
  });

  it('refuses a project without a repository', async () => {
    const unlinked = await insertProject(ctx.db, ctx.workspaceId, 'Local');
    const localTask = await insertTask(ctx.db, ctx.workspaceId, unlinked.id);

    const response = await startRun(localTask.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('project_not_linked');
  });

  it('refuses a project without a test command', async () => {
    await updateProject(ctx.db, ctx.workspaceId, project.id, { settings: { commands: {} } });

    const response = await startRun();

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('test_command_missing');
  });

  it('marks the task running', async () => {
    await startRun();

    expect((await getTask(ctx.db, ctx.workspaceId, task.id))?.status).toBe('running');
  });

  it('refuses to start without a model for the Programista', async () => {
    await updateWorkspaceSettings(ctx.db, ctx.workspaceId, { agentModels: { coder: null } });

    const response = await startRun();

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'agent_model_missing',
      message: 'Choose the model for the Programista agent in the workspace settings first',
    });
    expect(ctx.queue.enqueued).toEqual([]);
  });

  it('refuses to start when the chosen model can no longer be used', async () => {
    await updateModel(ctx.db, ctx.workspaceId, coderModel.id, { priceIn: null });

    const response = await startRun();

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('agent_model_unusable');
    expect(response.body.error.message).toMatch(/pricing/);
    expect((await getTask(ctx.db, ctx.workspaceId, task.id))?.status).toBe('draft');
  });

  it('answers 503 when the app runs without a queue', async () => {
    const app = createApp({
      db: ctx.db,
      secretBox: ctx.secretBox,
      resolveWorkspace: () => ctx.workspaceId,
    });

    const response = await request(app).post(`/api/tasks/${task.id}/runs`);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('queue_unavailable');
  });

  it('refuses a second run while the first is still open', async () => {
    await startRun();

    const response = await startRun();

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('run_already_active');
    expect(ctx.queue.enqueued).toHaveLength(1);
  });

  it('fails the run when the queue does not take it', async () => {
    ctx.queue.failWith = new Error('connection refused');

    const response = await startRun();

    expect(response.status).toBe(503);
    expect(response.body.error).toEqual({
      code: 'queue_unavailable',
      message: 'The run could not be queued',
    });
    const [run] = (await request(ctx.app).get(`/api/tasks/${task.id}/runs`)).body;
    expect(run).toMatchObject({ status: 'failed', error: { code: 'queue_unavailable' } });
    expect((await getTask(ctx.db, ctx.workspaceId, task.id))?.status).toBe('needs_human');
  });
});

describe('GET /api/tasks/:id/runs and /api/runs/:id', () => {
  it('lists runs newest first and returns one run', async () => {
    const first = (await startRun()).body;
    await request(ctx.app).post(`/api/runs/${first.id}/cancel`);
    const second = (await startRun()).body;

    const list = await request(ctx.app).get(`/api/tasks/${task.id}/runs`);
    const one = await request(ctx.app).get(`/api/runs/${second.id}`);

    expect(list.status).toBe(200);
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([second.id, first.id]);
    expect(one.status).toBe(200);
    expect(one.body).toEqual(second);
  });

  it('hides runs of other workspaces', async () => {
    const run = (await startRun()).body;
    const theirs = await insertProject(ctx.db, ctx.otherWorkspaceId);
    const theirTask = await insertTask(ctx.db, ctx.otherWorkspaceId, theirs.id);

    expect((await request(ctx.app).get(`/api/runs/${MISSING_ID}`)).status).toBe(404);
    expect((await request(ctx.app).get(`/api/tasks/${theirTask.id}/runs`)).status).toBe(404);
    expect(await getRun(ctx.db, ctx.otherWorkspaceId, run.id)).toBeNull();
  });

  it('returns only the code and message of a run error', async () => {
    const run = (await startRun()).body;
    await claimRun(ctx.db, run.id, 1);
    await finishRun(ctx.db, ctx.workspaceId, run.id, {
      status: 'failed',
      error: { code: 'tests_failed', message: 'Tests exited with code 1' },
    });

    const response = await request(ctx.app).get(`/api/runs/${run.id}`);

    expect(response.body.error).toEqual({
      code: 'tests_failed',
      message: 'Tests exited with code 1',
    });
    expect(response.body.endedAt).not.toBeNull();
  });
});

describe('POST /api/runs/:id/cancel', () => {
  it('cancels a queued run at once', async () => {
    const run = (await startRun()).body;

    const response = await request(ctx.app).post(`/api/runs/${run.id}/cancel`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'cancelled' });
    expect(response.body.endedAt).not.toBeNull();
  });

  it('asks the worker to stop an active run', async () => {
    const run = (await startRun()).body;
    await claimRun(ctx.db, run.id, 1);

    const response = await request(ctx.app).post(`/api/runs/${run.id}/cancel`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('preparing');
    expect(response.body.cancelRequestedAt).not.toBeNull();
  });

  it('answers 409 for a finished run and 404 for a missing one', async () => {
    const run = (await startRun()).body;
    await request(ctx.app).post(`/api/runs/${run.id}/cancel`);

    const again = await request(ctx.app).post(`/api/runs/${run.id}/cancel`);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('run_not_active');
    expect((await request(ctx.app).post(`/api/runs/${MISSING_ID}/cancel`)).status).toBe(404);
  });
});

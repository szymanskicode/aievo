import {
  claimRun,
  createToolCall,
  finishRun,
  finishStep,
  getRun,
  getTask,
  startStep,
  updateModel,
  updateProject,
  updateWorkspaceSettings,
} from '@aievo/db';
import type { Model, Project, Task } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { runSchema, stepSchema, taskSchema } from '@aievo/shared';
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

/** The API as the other workspace sees it. */
const otherWorkspaceApp = () =>
  createApp({
    db: ctx.db,
    secretBox: ctx.secretBox,
    queue: ctx.queue,
    resolveWorkspace: () => ctx.otherWorkspaceId,
  });

/** A claimed run with an `implement` step of `calls` tool calls; the step is left running. */
async function runWithStep(calls: number) {
  const run = (await startRun()).body as { id: string };
  await claimRun(ctx.db, run.id, 1);
  const step = await startStep(ctx.db, ctx.workspaceId, run.id, {
    stepKey: 'implement',
    agentKey: 'coder',
    agentVersion: 'v1',
  });
  if (!step) throw new Error('Step was not started');
  const toolCalls = [];
  for (let index = 0; index < calls; index += 1) {
    toolCalls.push(
      await createToolCall(ctx.db, ctx.workspaceId, step.id, {
        tool: 'read_file',
        args: { path: `file-${index}.ts` },
        result: `content ${index}`,
        isError: index === 1,
        durationMs: 5,
        exitCode: null,
      }),
    );
  }
  return { run, step, toolCalls: toolCalls.map((call) => call!) };
}

describe('GET /api/runs/:id/steps', () => {
  it('returns the steps with their first tool calls', async () => {
    const { run, step, toolCalls } = await runWithStep(3);

    const response = await request(ctx.app).get(`/api/runs/${run.id}/steps?toolCallLimit=2`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(stepSchema.safeParse(response.body[0]).success).toBe(true);
    expect(response.body[0]).toMatchObject({
      id: step.id,
      stepKey: 'implement',
      status: 'running',
      result: null,
      error: null,
      iterations: null,
      toolCallCount: 3,
      toolCalls: { nextCursor: toolCalls[1]!.id },
    });
    expect(response.body[0].toolCalls.items).toMatchObject([
      { tool: 'read_file', args: { path: 'file-0.ts' }, isError: false },
      { args: { path: 'file-1.ts' }, isError: true, result: 'content 1' },
    ]);
  });

  it('returns the result the agent finished with and nothing else of the output', async () => {
    const { run, step } = await runWithStep(0);
    const result = {
      summary: 'Added a greeting',
      changedFiles: ['src/hello.ts'],
      tests: { commands: ['npm test'], passed: true, summary: '1 passed' },
      openIssues: [],
    };
    await finishStep(ctx.db, ctx.workspaceId, step.id, {
      status: 'succeeded',
      output: { result, usage: { iterations: 4, costUsd: 0.1 }, secret: 'internal' },
    });

    const response = await request(ctx.app).get(`/api/runs/${run.id}/steps`);

    expect(response.body[0]).toMatchObject({ status: 'succeeded', result, iterations: 4 });
    expect(JSON.stringify(response.body)).not.toContain('internal');
  });

  it('returns only the code and message of a step error', async () => {
    const { run, step } = await runWithStep(0);
    await finishStep(ctx.db, ctx.workspaceId, step.id, {
      status: 'failed',
      output: {
        error: { code: 'iteration_limit', message: 'Too many iterations', raw: 'provider body' },
        usage: { iterations: 40, costUsd: 1 },
      },
    });

    const response = await request(ctx.app).get(`/api/runs/${run.id}/steps`);

    expect(response.body[0].error).toEqual({
      code: 'iteration_limit',
      message: 'Too many iterations',
    });
    expect(JSON.stringify(response.body)).not.toContain('provider body');
  });

  it('answers 404 for a missing run and a run of another workspace', async () => {
    const { run } = await runWithStep(1);
    const other = otherWorkspaceApp();

    expect((await request(ctx.app).get(`/api/runs/${MISSING_ID}/steps`)).status).toBe(404);
    expect((await request(other).get(`/api/runs/${run.id}/steps`)).status).toBe(404);
  });

  it('rejects a page size over the limit', async () => {
    const { run } = await runWithStep(0);

    const response = await request(ctx.app).get(`/api/runs/${run.id}/steps?toolCallLimit=1000`);

    expect(response.status).toBe(400);
  });
});

describe('GET /api/steps/:id/tool-calls', () => {
  it('pages through the tool calls with the cursor', async () => {
    const { step, toolCalls } = await runWithStep(3);

    const first = await request(ctx.app).get(`/api/steps/${step.id}/tool-calls?limit=2`);
    const second = await request(ctx.app).get(
      `/api/steps/${step.id}/tool-calls?limit=2&after=${first.body.nextCursor}`,
    );

    expect(first.status).toBe(200);
    expect(first.body.items.map((call: { id: string }) => call.id)).toEqual([
      toolCalls[0]!.id,
      toolCalls[1]!.id,
    ]);
    expect(second.body).toMatchObject({ items: [{ id: toolCalls[2]!.id }], nextCursor: null });
  });

  it('refuses a cursor of another step, or of no tool call, with 400', async () => {
    const { run, step } = await runWithStep(1);
    const otherStep = await startStep(ctx.db, ctx.workspaceId, run.id, {
      stepKey: 'check',
      agentKey: 'platform',
      agentVersion: 'v1',
    });
    const otherCall = await createToolCall(ctx.db, ctx.workspaceId, otherStep!.id, {
      tool: 'run_command',
      args: { command: 'npm test' },
      result: 'ok',
      isError: false,
      durationMs: 5,
      exitCode: 0,
    });

    const foreign = await request(ctx.app).get(
      `/api/steps/${step.id}/tool-calls?after=${otherCall!.id}`,
    );
    const missing = await request(ctx.app).get(
      `/api/steps/${step.id}/tool-calls?after=${MISSING_ID}`,
    );

    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('invalid_reference');
    expect(missing.status).toBe(400);
  });

  it('answers 404 for a step of another workspace', async () => {
    const { step } = await runWithStep(1);
    const other = otherWorkspaceApp();

    expect((await request(other).get(`/api/steps/${step.id}/tool-calls`)).status).toBe(404);
  });
});

describe('latest run of a task', () => {
  it('comes with the task in the list, alone and after an update', async () => {
    const run = (await startRun()).body as { id: string };
    const latestRun = { id: run.id, status: 'queued', prUrl: null, prNumber: null };

    const list = await request(ctx.app).get(`/api/projects/${project.id}/tasks`);
    const one = await request(ctx.app).get(`/api/tasks/${task.id}`);
    const updated = await request(ctx.app)
      .patch(`/api/tasks/${task.id}`)
      .send({ title: 'Renamed' });

    expect(list.body[0].latestRun).toEqual(latestRun);
    expect(one.body.latestRun).toEqual(latestRun);
    expect(updated.body.latestRun).toEqual(latestRun);
    expect(taskSchema.safeParse(one.body).success).toBe(true);
  });

  it('is null for a task that never ran', async () => {
    const response = await request(ctx.app).get(`/api/tasks/${task.id}`);

    expect(response.body.latestRun).toBeNull();
  });
});

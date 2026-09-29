import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DuplicateRowError } from '../errors.js';
import { run } from '../schema/index.js';
import { closeTestDb, getTestDb, resetDb } from '../test/db.js';
import { createWorkspace } from '../test/fixtures.js';
import { createProject } from './projects.js';
import {
  claimRun,
  createRun,
  createToolCall,
  failOrphanedRuns,
  finishRun,
  finishStep,
  getRun,
  isRunCancelRequested,
  listRunSteps,
  listStepToolCalls,
  listTaskRuns,
  requestRunCancel,
  startStep,
  updateRun,
} from './runs.js';
import type { Run } from './runs.js';
import { createTask } from './tasks.js';

const db = getTestDb();
let workspaceId: string;
let otherWorkspaceId: string;
let projectId: string;
let taskId: string;

beforeEach(async () => {
  await resetDb(db);
  workspaceId = await createWorkspace(db);
  otherWorkspaceId = await createWorkspace(db, 'Other');
  projectId = (await createProject(db, workspaceId, { name: 'Demo' })).id;
  taskId = await newTask('Fix login');
});

afterAll(closeTestDb);

async function newTask(title: string, inProject = projectId): Promise<string> {
  const created = await createTask(db, workspaceId, inProject, { title });
  if (!created) throw new Error('Task was not created');
  return created.id;
}

async function mustCreateRun(forTask = taskId): Promise<Run> {
  const created = await createRun(db, workspaceId, forTask);
  if (!created) throw new Error('Run was not created');
  return created;
}

async function mustClaim(runId: string, limit = 1) {
  const result = await claimRun(db, runId, limit);
  if (result.kind !== 'claimed') throw new Error(`Run was not claimed: ${result.kind}`);
  return result;
}

describe('createRun', () => {
  it('queues a run of a task in the workspace', async () => {
    const created = await mustCreateRun();

    expect(created).toMatchObject({ taskId, status: 'queued', cancelRequestedAt: null });
    expect(await getRun(db, workspaceId, created.id)).toEqual(created);
    expect(await listTaskRuns(db, workspaceId, taskId)).toEqual([created]);
  });

  it('returns null for a task of another workspace', async () => {
    expect(await createRun(db, otherWorkspaceId, taskId)).toBeNull();
  });

  it('refuses a second open run of the same task', async () => {
    await mustCreateRun();

    await expect(createRun(db, workspaceId, taskId)).rejects.toThrow(DuplicateRowError);
  });

  it('allows a new run once the previous one has finished', async () => {
    const first = await mustCreateRun();
    await requestRunCancel(db, workspaceId, first.id);

    const second = await mustCreateRun();

    expect((await listTaskRuns(db, workspaceId, taskId)).map((r) => r.id)).toEqual([
      second.id,
      first.id,
    ]);
  });
});

describe('workspace scoping', () => {
  it('hides runs, steps and tool calls from other workspaces', async () => {
    const created = await mustCreateRun();
    await mustClaim(created.id);
    const started = await startStep(db, workspaceId, created.id, {
      stepKey: 'check',
      agentKey: 'diagnostic',
      agentVersion: 'v1',
    });

    expect(await getRun(db, otherWorkspaceId, created.id)).toBeNull();
    expect(await listTaskRuns(db, otherWorkspaceId, taskId)).toEqual([]);
    expect(await requestRunCancel(db, otherWorkspaceId, created.id)).toBeNull();
    expect(await updateRun(db, otherWorkspaceId, created.id, { branch: 'x' })).toBeNull();
    expect(await finishRun(db, otherWorkspaceId, created.id, { status: 'failed' })).toBeNull();
    expect(
      await startStep(db, otherWorkspaceId, created.id, {
        stepKey: 'check',
        agentKey: 'diagnostic',
        agentVersion: 'v1',
      }),
    ).toBeNull();
    expect(await finishStep(db, otherWorkspaceId, started!.id, { status: 'failed' })).toBeNull();
    expect(
      await createToolCall(db, otherWorkspaceId, started!.id, {
        tool: 'run_command',
        args: {},
        result: '',
        isError: false,
        durationMs: 1,
        exitCode: 0,
      }),
    ).toBeNull();
    expect(await listRunSteps(db, otherWorkspaceId, created.id)).toEqual([]);
    expect(await isRunCancelRequested(db, otherWorkspaceId, created.id)).toBe(false);
  });
});

describe('requestRunCancel', () => {
  it('cancels a queued run at once', async () => {
    const created = await mustCreateRun();

    const result = await requestRunCancel(db, workspaceId, created.id);

    expect(result?.outcome).toBe('cancelled');
    expect(result?.run).toMatchObject({ status: 'cancelled' });
    expect(result?.run.endedAt).toBeInstanceOf(Date);
  });

  it('only flags an active run, which the worker then stops', async () => {
    const created = await mustCreateRun();
    await mustClaim(created.id);

    const result = await requestRunCancel(db, workspaceId, created.id);

    expect(result?.outcome).toBe('requested');
    expect(result?.run.status).toBe('preparing');
    expect(result?.run.cancelRequestedAt).toBeInstanceOf(Date);
    expect(await isRunCancelRequested(db, workspaceId, created.id)).toBe(true);

    const again = await requestRunCancel(db, workspaceId, created.id);
    expect(again?.outcome).toBe('requested');
    expect(again?.run.cancelRequestedAt).toEqual(result?.run.cancelRequestedAt);
  });

  it('leaves a finished run unchanged', async () => {
    const created = await mustCreateRun();
    await mustClaim(created.id);
    await finishRun(db, workspaceId, created.id, { status: 'succeeded' });

    const result = await requestRunCancel(db, workspaceId, created.id);

    expect(result?.outcome).toBe('final');
    expect(result?.run).toMatchObject({ status: 'succeeded', cancelRequestedAt: null });
  });
});

describe('claimRun', () => {
  it('moves a queued run to preparing and returns its task and project', async () => {
    const created = await mustCreateRun();

    const claimed = await mustClaim(created.id);

    expect(claimed.workspaceId).toBe(workspaceId);
    expect(claimed.run).toMatchObject({ id: created.id, status: 'preparing' });
    expect(claimed.run.startedAt).toBeInstanceOf(Date);
    expect(claimed.task.id).toBe(taskId);
    expect(claimed.project.id).toBe(projectId);
  });

  it('skips a missing run and a run that is no longer queued', async () => {
    const created = await mustCreateRun();
    await requestRunCancel(db, workspaceId, created.id);

    expect(await claimRun(db, created.id, 1)).toEqual({ kind: 'skip' });
    expect(await claimRun(db, '00000000-0000-4000-8000-000000000000', 1)).toEqual({
      kind: 'skip',
    });
  });

  it('keeps a run queued while the project is at its limit of active runs', async () => {
    const first = await mustCreateRun();
    const second = await mustCreateRun(await newTask('Second'));
    await mustClaim(first.id);

    expect(await claimRun(db, second.id, 1)).toEqual({ kind: 'busy' });
    expect((await getRun(db, workspaceId, second.id))?.status).toBe('queued');

    await finishRun(db, workspaceId, first.id, { status: 'succeeded' });
    expect((await claimRun(db, second.id, 1)).kind).toBe('claimed');
  });

  it('honours a higher limit and does not count other projects', async () => {
    const otherProject = (await createProject(db, workspaceId, { name: 'Other' })).id;
    const first = await mustCreateRun();
    const second = await mustCreateRun(await newTask('Second'));
    const third = await mustCreateRun(await newTask('Third'));
    const elsewhere = await mustCreateRun(await newTask('Elsewhere', otherProject));

    await mustClaim(first.id, 2);
    expect((await claimRun(db, second.id, 2)).kind).toBe('claimed');
    expect((await claimRun(db, third.id, 2)).kind).toBe('busy');
    expect((await claimRun(db, elsewhere.id, 1)).kind).toBe('claimed');
  });

  it('lets only one of two concurrent claims through', async () => {
    const first = await mustCreateRun();
    const second = await mustCreateRun(await newTask('Second'));

    const results = await Promise.all([claimRun(db, first.id, 1), claimRun(db, second.id, 1)]);

    expect(results.map((r) => r.kind).sort()).toEqual(['busy', 'claimed']);
  });
});

describe('updateRun and finishRun', () => {
  it('updates an open run and never touches a finished one', async () => {
    const created = await mustCreateRun();
    await mustClaim(created.id);

    const updated = await updateRun(db, workspaceId, created.id, {
      status: 'running',
      branch: 'agent/abc-fix',
    });
    expect(updated).toMatchObject({ status: 'running', branch: 'agent/abc-fix' });

    const finished = await finishRun(db, workspaceId, created.id, {
      status: 'failed',
      error: { code: 'tests_failed', message: 'Tests exited with code 1' },
    });
    expect(finished).toMatchObject({
      status: 'failed',
      error: { code: 'tests_failed', message: 'Tests exited with code 1' },
    });
    expect(finished?.endedAt).toBeInstanceOf(Date);

    expect(await updateRun(db, workspaceId, created.id, { status: 'running' })).toBeNull();
    expect(await finishRun(db, workspaceId, created.id, { status: 'succeeded' })).toBeNull();
    expect((await getRun(db, workspaceId, created.id))?.status).toBe('failed');
  });
});

describe('failOrphanedRuns', () => {
  it('fails active runs of every workspace and leaves queued and finished ones', async () => {
    const otherProject = (await createProject(db, otherWorkspaceId, { name: 'Theirs' })).id;
    const theirTask = await createTask(db, otherWorkspaceId, otherProject, { title: 'Theirs' });
    const active = await mustCreateRun();
    const queued = await mustCreateRun(await newTask('Queued'));
    const theirs = await createRun(db, otherWorkspaceId, theirTask!.id);
    await mustClaim(active.id);
    await mustClaim(theirs!.id);

    const failed = await failOrphanedRuns(db, { code: 'worker_restarted', message: 'Restarted' });

    expect(failed.map((r) => r.id).sort()).toEqual([active.id, theirs!.id].sort());
    const [row] = await db.select().from(run).where(eq(run.id, active.id));
    expect(row).toMatchObject({
      status: 'failed',
      error: { code: 'worker_restarted', message: 'Restarted' },
    });
    expect((await getRun(db, workspaceId, queued.id))?.status).toBe('queued');
  });
});

describe('steps and tool calls', () => {
  it('records a step with its tool calls', async () => {
    const created = await mustCreateRun();
    await mustClaim(created.id);

    const started = await startStep(db, workspaceId, created.id, {
      stepKey: 'check',
      agentKey: 'diagnostic',
      agentVersion: 'v1',
      input: { command: 'npm test' },
    });
    expect(started).toMatchObject({ status: 'running', stepKey: 'check' });
    expect(started?.startedAt).toBeInstanceOf(Date);

    const call = await createToolCall(db, workspaceId, started!.id, {
      tool: 'run_command',
      args: { command: 'npm test' },
      result: 'all passed',
      isError: false,
      durationMs: 1200,
      exitCode: 0,
    });
    const done = await finishStep(db, workspaceId, started!.id, {
      status: 'succeeded',
      output: { exitCode: 0 },
    });

    expect(done).toMatchObject({ status: 'succeeded', output: { exitCode: 0 } });
    expect(await finishStep(db, workspaceId, started!.id, { status: 'failed' })).toBeNull();
    expect(await listRunSteps(db, workspaceId, created.id)).toEqual([done]);
    expect(await listStepToolCalls(db, workspaceId, started!.id)).toEqual([call]);
  });

  it('does not start a step of a finished run', async () => {
    const created = await mustCreateRun();
    await requestRunCancel(db, workspaceId, created.id);

    expect(
      await startStep(db, workspaceId, created.id, {
        stepKey: 'check',
        agentKey: 'diagnostic',
        agentVersion: 'v1',
      }),
    ).toBeNull();
  });
});

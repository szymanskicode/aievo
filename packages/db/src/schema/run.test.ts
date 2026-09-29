import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createProject, updateProject } from '../repositories/projects.js';
import type { Project } from '../repositories/projects.js';
import { createTask, deleteTask } from '../repositories/tasks.js';
import { closeTestDb, getTestDb, resetDb } from '../test/db.js';
import { createWorkspace } from '../test/fixtures.js';
import { project } from './project.js';
import { run, step, toolCall } from './run.js';

const db = getTestDb();
let workspaceId: string;
let ownProject: Project;

beforeEach(async () => {
  await resetDb(db);
  workspaceId = await createWorkspace(db);
  ownProject = await createProject(db, workspaceId, { name: 'Demo' });
});

afterAll(closeTestDb);

async function insertRunTree(taskId: string) {
  const [newRun] = await db.insert(run).values({ taskId }).returning();
  const [newStep] = await db
    .insert(step)
    .values({ runId: newRun!.id, stepKey: 'implement', agentKey: 'coder', agentVersion: 'abc123' })
    .returning();
  const [newCall] = await db
    .insert(toolCall)
    .values({
      stepId: newStep!.id,
      tool: 'run_command',
      args: { command: 'pnpm test' },
      result: 'ok',
      durationMs: 12,
      exitCode: 0,
    })
    .returning();
  return { run: newRun!, step: newStep!, toolCall: newCall! };
}

describe('run tables', () => {
  it('apply the defaults of a fresh run, step and tool call', async () => {
    const task = await createTask(db, workspaceId, ownProject.id, { title: 'Task' });
    const tree = await insertRunTree(task!.id);

    expect(tree.run).toMatchObject({
      status: 'queued',
      costUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
      branch: null,
      prUrl: null,
      prNumber: null,
      error: null,
      startedAt: null,
      endedAt: null,
    });
    expect(tree.step).toMatchObject({ status: 'queued', iteration: 1, input: null, output: null });
    expect(tree.toolCall).toMatchObject({ isError: false, args: { command: 'pnpm test' } });
  });

  it('are removed together with their task', async () => {
    const task = await createTask(db, workspaceId, ownProject.id, { title: 'Task' });
    const tree = await insertRunTree(task!.id);

    await deleteTask(db, workspaceId, task!.id);

    expect(await db.select().from(run).where(eq(run.id, tree.run.id))).toEqual([]);
    expect(await db.select().from(step).where(eq(step.id, tree.step.id))).toEqual([]);
    expect(await db.select().from(toolCall).where(eq(toolCall.id, tree.toolCall.id))).toEqual([]);
  });

  it('reject an unknown run status', async () => {
    const task = await createTask(db, workspaceId, ownProject.id, { title: 'Task' });

    await expect(
      db.insert(run).values({ taskId: task!.id, status: 'done' as 'queued' }),
    ).rejects.toMatchObject({ cause: { code: '22P02' } });
  });
});

describe('project repository columns', () => {
  it('require the repo owner and name together', async () => {
    await expect(
      db.update(project).set({ repoOwner: 'octocat' }).where(eq(project.id, ownProject.id)),
    ).rejects.toMatchObject({ cause: { code: '23514' } });

    await db
      .update(project)
      .set({ repoOwner: 'octocat', repoName: 'demo' })
      .where(eq(project.id, ownProject.id));
    const updated = await updateProject(db, workspaceId, ownProject.id, {});
    expect(updated).toMatchObject({
      repoOwner: 'octocat',
      repoName: 'demo',
      gitCredentialId: null,
    });
  });
});

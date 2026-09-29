import { ACTIVE_RUN_STATUSES, FINAL_RUN_STATUSES } from '@aievo/shared';
import type { JsonValue, RunError, StepStatus, TaskStatus } from '@aievo/shared';
import { and, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';

import type { Db } from '../client.js';
import { DuplicateRowError } from '../errors.js';
import { project, run, step, task, toolCall } from '../schema/index.js';
import type { Project } from './projects.js';
import type { Task } from './tasks.js';

export type Run = typeof run.$inferSelect;
export type Step = typeof step.$inferSelect;
export type ToolCall = typeof toolCall.$inferSelect;

type Executor = Pick<Db, 'select'>;

/** Runs have no workspaceId of their own: they are scoped through task → project. */
const runsOf = (db: Executor, workspaceId: string) =>
  db
    .select({ id: run.id })
    .from(run)
    .innerJoin(task, eq(task.id, run.taskId))
    .innerJoin(project, eq(project.id, task.projectId))
    .where(eq(project.workspaceId, workspaceId));

const inWorkspace = (db: Executor, workspaceId: string, id: string) =>
  and(eq(run.id, id), inArray(run.id, runsOf(db, workspaceId)));

const OPEN_STATUSES = ['queued', ...ACTIVE_RUN_STATUSES] as const;

/**
 * A run moves its task on only while the task is still `running`: a status someone set by
 * hand during the run (e.g. `done` on the board) wins.
 */
const taskStillRunning = eq(task.status, 'running');

/**
 * Queues a new run of the task. Returns `null` when the task does not exist in the workspace
 * and throws `DuplicateRowError` when the task already has a queued or active run.
 */
export async function createRun(db: Db, workspaceId: string, taskId: string): Promise<Run | null> {
  return db.transaction(async (tx) => {
    // Locking the task row serialises concurrent requests for the same task.
    const [owner] = await tx
      .select({ id: task.id })
      .from(task)
      .innerJoin(project, eq(project.id, task.projectId))
      .where(and(eq(task.id, taskId), eq(project.workspaceId, workspaceId)))
      .for('update', { of: task });
    if (!owner) return null;

    const [open] = await tx
      .select({ id: run.id })
      .from(run)
      .where(and(eq(run.taskId, taskId), inArray(run.status, OPEN_STATUSES)))
      .limit(1);
    if (open) throw new DuplicateRowError('The task already has a queued or active run');

    const [row] = await tx.insert(run).values({ taskId }).returning();
    if (!row) throw new Error('Run insert returned no row');
    await tx.update(task).set({ status: 'running' }).where(eq(task.id, taskId));
    return row;
  });
}

export async function getRun(db: Db, workspaceId: string, id: string): Promise<Run | null> {
  const [row] = await db
    .select()
    .from(run)
    .where(inWorkspace(db, workspaceId, id));
  return row ?? null;
}

/** Runs of the task, newest first. Empty when the task is not in the workspace. */
export async function listTaskRuns(db: Db, workspaceId: string, taskId: string): Promise<Run[]> {
  return db
    .select()
    .from(run)
    .where(and(eq(run.taskId, taskId), inArray(run.id, runsOf(db, workspaceId))))
    .orderBy(desc(run.createdAt));
}

export type CancelOutcome =
  /** The run was still queued and is now `cancelled`. */
  | 'cancelled'
  /** A worker owns the run; it was asked to stop and sets the final status itself. */
  | 'requested'
  /** The run had already finished; nothing changed. */
  | 'final';

/** Returns `null` when the run does not exist in the workspace. */
export async function requestRunCancel(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<{ run: Run; outcome: CancelOutcome } | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(run)
      .where(inWorkspace(tx, workspaceId, id))
      .for('update', { of: run });
    if (!current) return null;

    if (current.status === 'queued') {
      const [row] = await tx
        .update(run)
        .set({ status: 'cancelled', cancelRequestedAt: sql`now()`, endedAt: sql`now()` })
        .where(eq(run.id, id))
        .returning();
      await tx
        .update(task)
        .set({ status: TASK_STATUS_AFTER_RUN.cancelled })
        .where(and(eq(task.id, current.taskId), taskStillRunning));
      return { run: row ?? current, outcome: 'cancelled' };
    }
    if ((FINAL_RUN_STATUSES as readonly string[]).includes(current.status)) {
      return { run: current, outcome: 'final' };
    }
    if (current.cancelRequestedAt) return { run: current, outcome: 'requested' };

    const [row] = await tx
      .update(run)
      .set({ cancelRequestedAt: sql`now()` })
      .where(eq(run.id, id))
      .returning();
    return { run: row ?? current, outcome: 'requested' };
  });
}

/** What a worker needs to execute a run it has claimed. */
export interface ClaimedRun {
  workspaceId: string;
  run: Run;
  task: Task;
  project: Project;
}

export type ClaimResult =
  | ({ kind: 'claimed' } & ClaimedRun)
  /** The project already has `maxActivePerProject` active runs; try again later. */
  | { kind: 'busy' }
  /** The run is gone or no longer queued (e.g. cancelled while waiting); drop the job. */
  | { kind: 'skip' };

/**
 * Moves a queued run to `preparing` unless its project already has `maxActivePerProject`
 * active runs. Called by the worker, which only knows the run id from the job; the workspace
 * comes from the run itself and scopes every later call.
 */
export async function claimRun(
  db: Db,
  runId: string,
  maxActivePerProject: number,
): Promise<ClaimResult> {
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ run, task, project })
      .from(run)
      .innerJoin(task, eq(task.id, run.taskId))
      .innerJoin(project, eq(project.id, task.projectId))
      .where(eq(run.id, runId))
      .for('update', { of: run });
    if (!found || found.run.status !== 'queued') return { kind: 'skip' };

    // Serialises claims per project, so two workers cannot both see a free slot.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${found.project.id}))`);
    const active = await tx
      .select({ id: run.id })
      .from(run)
      .innerJoin(task, eq(task.id, run.taskId))
      .where(
        and(
          eq(task.projectId, found.project.id),
          inArray(run.status, ACTIVE_RUN_STATUSES),
          ne(run.id, runId),
        ),
      );
    if (active.length >= maxActivePerProject) return { kind: 'busy' };

    const [claimed] = await tx
      .update(run)
      .set({ status: 'preparing', startedAt: sql`now()` })
      .where(eq(run.id, runId))
      .returning();
    if (!claimed) return { kind: 'skip' };
    return {
      kind: 'claimed',
      workspaceId: found.project.workspaceId,
      run: claimed,
      task: found.task,
      project: found.project,
    };
  });
}

export interface RunPatch {
  status?: (typeof ACTIVE_RUN_STATUSES)[number];
  branch?: string;
}

/**
 * Updates a run that is still open; a finished run is never changed again. Returns `null`
 * when the run is not open (or not in the workspace).
 */
export async function updateRun(
  db: Db,
  workspaceId: string,
  id: string,
  patch: RunPatch,
): Promise<Run | null> {
  const [row] = await db
    .update(run)
    .set(patch)
    .where(and(inWorkspace(db, workspaceId, id), inArray(run.status, OPEN_STATUSES)))
    .returning();
  return row ?? null;
}

type FinalRunStatus = (typeof FINAL_RUN_STATUSES)[number];

/**
 * Status the task of a run gets when the run ends: a pull request waits for review, a
 * failure for a human, and a cancelled run leaves the task ready for another one.
 */
export const TASK_STATUS_AFTER_RUN = {
  succeeded: 'in_review',
  failed: 'needs_human',
  cancelled: 'ready',
} as const satisfies Record<FinalRunStatus, TaskStatus>;

/**
 * Sets the final status of an open run and moves its task on (`TASK_STATUS_AFTER_RUN`), in
 * one transaction. Returns `null` when the run had already finished; the task is then left
 * alone.
 */
export async function finishRun(
  db: Db,
  workspaceId: string,
  id: string,
  result: { status: FinalRunStatus; error?: RunError | null },
): Promise<Run | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(run)
      .set({ status: result.status, error: result.error ?? null, endedAt: sql`now()` })
      .where(and(inWorkspace(tx, workspaceId, id), inArray(run.status, OPEN_STATUSES)))
      .returning();
    if (!row) return null;
    await tx
      .update(task)
      .set({ status: TASK_STATUS_AFTER_RUN[result.status] })
      .where(and(eq(task.id, row.taskId), taskStillRunning));
    return row;
  });
}

/** Records the pull request of an open run. Returns `null` when the run is not open. */
export async function setRunPullRequest(
  db: Db,
  workspaceId: string,
  id: string,
  pr: { url: string; number: number },
): Promise<Run | null> {
  const [row] = await db
    .update(run)
    .set({ prUrl: pr.url, prNumber: pr.number })
    .where(and(inWorkspace(db, workspaceId, id), inArray(run.status, OPEN_STATUSES)))
    .returning();
  return row ?? null;
}

export async function isRunCancelRequested(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const [row] = await db
    .select({ cancelRequestedAt: run.cancelRequestedAt, status: run.status })
    .from(run)
    .where(inWorkspace(db, workspaceId, id));
  return row?.cancelRequestedAt != null || row?.status === 'cancelled';
}

/**
 * Fails every run a worker was executing. Only for worker start-up, when no run can still be
 * executing: it deliberately spans all workspaces, because the stale runs of all of them
 * belong to the worker that died.
 */
export async function failOrphanedRuns(db: Db, error: RunError): Promise<Run[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(run)
      .set({ status: 'failed', error, endedAt: sql`now()` })
      .where(inArray(run.status, ACTIVE_RUN_STATUSES))
      .returning();
    if (rows.length > 0) {
      await tx
        .update(task)
        .set({ status: TASK_STATUS_AFTER_RUN.failed })
        .where(
          and(
            inArray(
              task.id,
              rows.map((row) => row.taskId),
            ),
            taskStillRunning,
          ),
        );
    }
    return rows;
  });
}

export interface NewStepInput {
  stepKey: string;
  agentKey: string;
  agentVersion: string;
  input?: JsonValue;
}

/** Starts a step of an open run. Returns `null` when the run is not open in the workspace. */
export async function startStep(
  db: Db,
  workspaceId: string,
  runId: string,
  input: NewStepInput,
): Promise<Step | null> {
  const [owner] = await db
    .select({ id: run.id })
    .from(run)
    .where(and(inWorkspace(db, workspaceId, runId), inArray(run.status, OPEN_STATUSES)));
  if (!owner) return null;

  const [row] = await db
    .insert(step)
    .values({ ...input, runId, status: 'running', startedAt: sql`now()` })
    .returning();
  if (!row) throw new Error('Step insert returned no row');
  return row;
}

const stepsOf = (db: Executor, workspaceId: string) =>
  db
    .select({ id: step.id })
    .from(step)
    .where(inArray(step.runId, runsOf(db, workspaceId)));

/** Sets the final status of a running step. Returns `null` when it had already finished. */
export async function finishStep(
  db: Db,
  workspaceId: string,
  id: string,
  result: { status: Exclude<StepStatus, 'queued' | 'running'>; output?: JsonValue },
): Promise<Step | null> {
  const [row] = await db
    .update(step)
    .set({ status: result.status, output: result.output ?? null, endedAt: sql`now()` })
    .where(
      and(
        eq(step.id, id),
        inArray(step.id, stepsOf(db, workspaceId)),
        notInArray(step.status, ['succeeded', 'failed', 'cancelled']),
      ),
    )
    .returning();
  return row ?? null;
}

export interface StepUsage {
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Adds tokens and cost of one model response to a running step and to its run, so the run
 * always holds the sum of its steps. Returns `false` when the step is not running in the
 * workspace (nothing is changed then).
 */
export async function addStepUsage(
  db: Db,
  workspaceId: string,
  stepId: string,
  usage: StepUsage,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(step)
      .set({
        costUsd: sql`${step.costUsd} + ${usage.costUsd}`,
        tokensIn: sql`${step.tokensIn} + ${usage.tokensIn}`,
        tokensOut: sql`${step.tokensOut} + ${usage.tokensOut}`,
      })
      .where(
        and(
          eq(step.id, stepId),
          inArray(step.id, stepsOf(tx, workspaceId)),
          eq(step.status, 'running'),
        ),
      )
      .returning({ runId: step.runId });
    if (!updated) return false;
    await tx
      .update(run)
      .set({
        costUsd: sql`${run.costUsd} + ${usage.costUsd}`,
        tokensIn: sql`${run.tokensIn} + ${usage.tokensIn}`,
        tokensOut: sql`${run.tokensOut} + ${usage.tokensOut}`,
      })
      .where(eq(run.id, updated.runId));
    return true;
  });
}

/** `result` must already be cut with `truncateToolResult`. */
export interface NewToolCallInput {
  tool: string;
  args: JsonValue;
  result: string;
  isError: boolean;
  durationMs: number;
  exitCode: number | null;
}

/** Returns `null` when the step is not in the workspace. */
export async function createToolCall(
  db: Db,
  workspaceId: string,
  stepId: string,
  input: NewToolCallInput,
): Promise<ToolCall | null> {
  const [owner] = await db
    .select({ id: step.id })
    .from(step)
    .where(and(eq(step.id, stepId), inArray(step.id, stepsOf(db, workspaceId))));
  if (!owner) return null;

  const [row] = await db
    .insert(toolCall)
    .values({ ...input, stepId })
    .returning();
  if (!row) throw new Error('Tool call insert returned no row');
  return row;
}

/** Steps of the run in creation order; empty when the run is not in the workspace. */
export async function listRunSteps(db: Db, workspaceId: string, runId: string): Promise<Step[]> {
  return db
    .select()
    .from(step)
    .where(and(eq(step.runId, runId), inArray(step.runId, runsOf(db, workspaceId))))
    .orderBy(step.createdAt);
}

/** Tool calls of the step in creation order; empty when the step is not in the workspace. */
export async function listStepToolCalls(
  db: Db,
  workspaceId: string,
  stepId: string,
): Promise<ToolCall[]> {
  return db
    .select()
    .from(toolCall)
    .where(and(eq(toolCall.stepId, stepId), inArray(toolCall.stepId, stepsOf(db, workspaceId))))
    .orderBy(toolCall.createdAt);
}

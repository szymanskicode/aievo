import type { TaskPriority, TaskStatus, TaskType } from '@aievo/shared';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';

import type { Db } from '../client.js';
import { InvalidReferenceError } from '../errors.js';
import { project, task } from '../schema/index.js';

export type Task = typeof task.$inferSelect;

export interface NewTaskInput {
  title: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  acceptanceCriteria?: string;
  labels?: string[];
  position?: number;
  parentId?: string | null;
}

export type TaskPatch = Partial<NewTaskInput>;

export interface TaskFilter {
  projectId: string;
  status?: TaskStatus;
}

type Executor = Pick<Db, 'select' | 'execute'>;

/** Tasks have no workspaceId of their own: they are scoped through their project. */
const projectsOf = (db: Executor, workspaceId: string) =>
  db.select({ id: project.id }).from(project).where(eq(project.workspaceId, workspaceId));

const inWorkspace = (db: Executor, workspaceId: string, id: string) =>
  and(eq(task.id, id), inArray(task.projectId, projectsOf(db, workspaceId)));

function toValues(input: TaskPatch): Partial<typeof task.$inferInsert> {
  const values: Partial<typeof task.$inferInsert> = {};
  if (input.title !== undefined) values.title = input.title;
  if (input.description !== undefined) values.description = input.description;
  if (input.type !== undefined) values.type = input.type;
  if (input.priority !== undefined) values.priority = input.priority;
  if (input.status !== undefined) values.status = input.status;
  if (input.acceptanceCriteria !== undefined) values.acceptanceCriteria = input.acceptanceCriteria;
  if (input.labels !== undefined) values.labels = input.labels;
  if (input.position !== undefined) values.position = input.position;
  if (input.parentId !== undefined) values.parentId = input.parentId;
  return values;
}

/** True when `taskId` is `parentId` itself or one of its ancestors. */
async function isAncestorOrSelf(db: Pick<Db, 'execute'>, taskId: string, parentId: string) {
  // UNION (not UNION ALL) stops the walk even if the data already contains a cycle.
  const result = await db.execute(sql`
    WITH RECURSIVE ancestors (id, parent_id) AS (
      SELECT ${task.id}, ${task.parentId} FROM ${task} WHERE ${task.id} = ${parentId}
      UNION
      SELECT t.id, t.parent_id FROM ${task} t JOIN ancestors a ON t.id = a.parent_id
    )
    SELECT 1 FROM ancestors WHERE id = ${taskId} LIMIT 1
  `);
  return result.rows.length > 0;
}

/**
 * The parent must be a task of the same project and, when re-parenting an existing
 * task, must not be that task or one of its descendants (no cycles).
 */
async function assertValidParent(
  db: Executor,
  projectId: string,
  parentId: string,
  taskId?: string,
): Promise<void> {
  if (parentId === taskId) throw new InvalidReferenceError('A task cannot be its own parent');
  const [parent] = await db
    .select({ id: task.id })
    .from(task)
    .where(and(eq(task.id, parentId), eq(task.projectId, projectId)));
  if (!parent) throw new InvalidReferenceError('Parent task not found in this project');
  if (taskId !== undefined && (await isAncestorOrSelf(db, taskId, parentId))) {
    throw new InvalidReferenceError('A task cannot be moved under its own subtask');
  }
}

export async function listTasks(db: Db, workspaceId: string, filter: TaskFilter): Promise<Task[]> {
  return db
    .select()
    .from(task)
    .where(
      and(
        eq(task.projectId, filter.projectId),
        inArray(task.projectId, projectsOf(db, workspaceId)),
        filter.status === undefined ? undefined : eq(task.status, filter.status),
      ),
    )
    .orderBy(asc(task.position), asc(task.createdAt));
}

export async function getTask(db: Db, workspaceId: string, id: string): Promise<Task | null> {
  const [row] = await db
    .select()
    .from(task)
    .where(inWorkspace(db, workspaceId, id));
  return row ?? null;
}

/**
 * Returns `null` when the project does not exist in the workspace. Without an explicit
 * `position` the task goes to the end of the project.
 */
export async function createTask(
  db: Db,
  workspaceId: string,
  projectId: string,
  input: NewTaskInput,
): Promise<Task | null> {
  return db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)));
    if (!owner) return null;

    if (input.parentId != null) await assertValidParent(tx, projectId, input.parentId);

    let position = input.position;
    if (position === undefined) {
      const [last] = await tx
        .select({ value: max(task.position) })
        .from(task)
        .where(eq(task.projectId, projectId));
      position = (last?.value ?? 0) + 1;
    }

    const [row] = await tx
      .insert(task)
      .values({ ...toValues(input), projectId, title: input.title, position })
      .returning();
    if (!row) throw new Error('Task insert returned no row');
    return row;
  });
}

/** Returns `null` when the task does not exist in the workspace. */
export async function updateTask(
  db: Db,
  workspaceId: string,
  id: string,
  patch: TaskPatch,
): Promise<Task | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(task)
      .where(inWorkspace(tx, workspaceId, id));
    if (!current) return null;

    if (patch.parentId != null) await assertValidParent(tx, current.projectId, patch.parentId, id);

    const values = toValues(patch);
    if (Object.keys(values).length === 0) return current;

    const [row] = await tx.update(task).set(values).where(eq(task.id, id)).returning();
    return row ?? null;
  });
}

export async function deleteTask(db: Db, workspaceId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(task)
    .where(inWorkspace(db, workspaceId, id))
    .returning({ id: task.id });
  return rows.length > 0;
}

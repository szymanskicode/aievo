import type { Schemas } from '@aievo/api-client';
import { taskStatuses } from '@aievo/shared';
import type { TaskStatus } from '@aievo/shared';

type Task = Schemas['Task'];

export type Columns = Record<TaskStatus, Task[]>;

/** Tasks per status, each column in board order (`position`, then creation time). */
export function groupByStatus(tasks: readonly Task[]): Columns {
  const columns = Object.fromEntries(
    taskStatuses.map((status) => [status, [] as Task[]]),
  ) as Columns;
  for (const task of tasks) columns[task.status].push(task);
  for (const status of taskStatuses) {
    columns[status].sort(
      (a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt),
    );
  }
  return columns;
}

/**
 * A position between two neighbours. Positions are floats, so a card is placed between two
 * others without renumbering the column.
 */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

export interface TaskMove {
  /** All tasks after the move. */
  tasks: Task[];
  /** What `PATCH /tasks/:id` must receive. */
  patch: Pick<Task, 'status' | 'position'>;
}

/**
 * Moves a task to `index` of the `status` column, where `index` counts the column without
 * the moved task. Returns `null` when the task would stay where it is.
 */
export function moveTask(
  tasks: readonly Task[],
  taskId: string,
  status: TaskStatus,
  index: number,
): TaskMove | null {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) return null;

  const columns = groupByStatus(tasks);
  const target = columns[status].filter((candidate) => candidate.id !== taskId);
  const at = Math.max(0, Math.min(index, target.length));

  if (task.status === status && columns[status].indexOf(task) === at) return null;

  const patch = {
    status,
    position: positionBetween(target[at - 1]?.position, target[at]?.position),
  };
  return {
    tasks: tasks.map((candidate) =>
      candidate.id === taskId ? { ...candidate, ...patch } : candidate,
    ),
    patch,
  };
}

export type DropTarget =
  { kind: 'column'; status: TaskStatus } | { kind: 'task'; taskId: string; placeAfter: boolean };

/**
 * Where a dragged task lands: on an empty part of a column it goes to the end; on a card,
 * it takes that card's place in the same column, or goes above/below it in another column.
 */
export function resolveDrop(
  tasks: readonly Task[],
  taskId: string,
  target: DropTarget,
): { status: TaskStatus; index: number } | null {
  const columns = groupByStatus(tasks);
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) return null;

  if (target.kind === 'column') {
    const others = columns[target.status].filter((candidate) => candidate.id !== taskId);
    return { status: target.status, index: others.length };
  }

  const over = tasks.find((candidate) => candidate.id === target.taskId);
  if (!over) return null;
  const column = columns[over.status];
  const overIndex = column.indexOf(over);

  // Same column: like reordering a list, the card takes the index of the one it is over.
  if (over.status === task.status) return { status: over.status, index: overIndex };

  return { status: over.status, index: overIndex + (target.placeAfter ? 1 : 0) };
}

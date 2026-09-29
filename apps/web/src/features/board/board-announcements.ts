import type { Schemas } from '@aievo/api-client';
import type { TaskStatus } from '@aievo/shared';
import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core';

import { statusLabels } from '@/features/tasks/labels';

type Task = Schemas['Task'];

/** What dnd-kit reports about a draggable or droppable: its id and the data we attached. */
interface Target {
  id: string | number;
  data: { current?: Record<string, unknown> | undefined };
}

export const boardInstructions: ScreenReaderInstructions = {
  draggable:
    'To pick up a task, press Space or Enter. Use the arrow keys to move it to another ' +
    'place or column, press Space or Enter again to drop it, or Escape to cancel.',
};

/**
 * Screen reader messages for dragging cards. dnd-kit's defaults read out ids, which here are
 * UUIDs; these name the task and the column instead.
 */
export function boardAnnouncements(tasks: readonly Task[]): Announcements {
  const byId = new Map(tasks.map((task) => [task.id, task]));

  const title = (target: Target) => `"${byId.get(String(target.id))?.title ?? 'task'}"`;

  /** The column a target belongs to: the column itself or the column of the card. */
  const column = (target: Target): string | undefined => {
    const status = target.data.current?.status as TaskStatus | undefined;
    if (target.data.current?.type === 'column' && status) return statusLabels[status];
    const task = byId.get(String(target.id));
    return task && statusLabels[task.status];
  };

  return {
    onDragStart: ({ active }) => `Picked up task ${title(active)}.`,
    onDragOver: ({ active, over }) => {
      if (!over) return `Task ${title(active)} is no longer over a column.`;
      if (over.data.current?.type === 'column') {
        return `Task ${title(active)} is over the ${column(over)} column.`;
      }
      return `Task ${title(active)} is over task ${title(over)} in ${column(over)}.`;
    },
    onDragEnd: ({ active, over }) =>
      over
        ? `Task ${title(active)} was dropped in ${column(over)}.`
        : `Task ${title(active)} was dropped outside the board and did not move.`,
    onDragCancel: ({ active }) => `Moving task ${title(active)} was cancelled.`,
  };
}

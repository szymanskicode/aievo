import type { TaskStatus } from '@aievo/shared';
import type { UniqueIdentifier } from '@dnd-kit/core';

import type { DropTarget } from './board-model';

interface Box {
  top: number;
  height: number;
}

/** The part of dnd-kit's `DragEndEvent` that decides where a card was dropped. */
export interface DragEnd {
  active: { rect: { current: { translated: Box | null } } };
  over: { id: UniqueIdentifier; rect: Box; data: { current?: unknown } } | null;
}

/** Reads where a drag ended from the data that columns and cards attach to dnd-kit. */
export function dropTargetOf({ active, over }: DragEnd): DropTarget | null {
  if (!over) return null;
  const data = over.data.current as { type?: string; status?: TaskStatus } | undefined;
  if (data?.type === 'column' && data.status) return { kind: 'column', status: data.status };

  const dragged = active.rect.current.translated;
  const placeAfter = dragged
    ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2
    : false;
  return { kind: 'task', taskId: String(over.id), placeAfter };
}

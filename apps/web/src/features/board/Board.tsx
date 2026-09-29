import type { Schemas } from '@aievo/api-client';
import { taskStatuses } from '@aievo/shared';
import type { TaskStatus } from '@aievo/shared';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useState } from 'react';

import { useMoveTask } from '@/features/tasks/queries';

import { groupByStatus, moveTask, resolveDrop } from './board-model';
import type { DropTarget } from './board-model';
import { BoardColumn } from './BoardColumn';
import { TaskCardPreview } from './TaskCard';

interface BoardProps {
  projectId: string;
  tasks: Schemas['Task'][];
}

/** Reads where a drag ended from the data that columns and cards attach to dnd-kit. */
function dropTargetOf({ active, over }: DragEndEvent): DropTarget | null {
  if (!over) return null;
  const data = over.data.current as { type?: string; status?: TaskStatus } | undefined;
  if (data?.type === 'column' && data.status) return { kind: 'column', status: data.status };

  const dragged = active.rect.current.translated;
  const placeAfter = dragged
    ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2
    : false;
  return { kind: 'task', taskId: String(over.id), placeAfter };
}

export function Board({ projectId, tasks }: BoardProps) {
  const moveMutation = useMoveTask(projectId);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const sensors = useSensors(
    // A click (e.g. on the title) is not a drag until the pointer moves a little.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = groupByStatus(tasks);
  const dragged = tasks.find((task) => task.id === draggedId);

  function move(taskId: string, status: TaskStatus, index: number) {
    const result = moveTask(tasks, taskId, status, index);
    if (result) moveMutation.mutate({ taskId, patch: result.patch, optimistic: result.tasks });
  }

  function onDragStart({ active }: DragStartEvent) {
    setDraggedId(String(active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggedId(null);
    const target = dropTargetOf(event);
    const taskId = String(event.active.id);
    const drop = target && resolveDrop(tasks, taskId, target);
    if (drop) move(taskId, drop.status, drop.index);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggedId(null)}
    >
      <div role="group" aria-label="Task board" className="flex gap-3 overflow-x-auto pb-4">
        {taskStatuses.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={columns[status]}
            onMoveTo={(taskId, next) => move(taskId, next, columns[next].length)}
          />
        ))}
      </div>
      <DragOverlay>{dragged ? <TaskCardPreview task={dragged} /> : null}</DragOverlay>
    </DndContext>
  );
}

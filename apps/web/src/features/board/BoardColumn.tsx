import type { Schemas } from '@aievo/api-client';
import type { TaskStatus } from '@aievo/shared';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import { statusLabels } from '@/features/tasks/labels';

import { TaskCard } from './TaskCard';

const columnId = (status: TaskStatus) => `column:${status}`;

interface BoardColumnProps {
  status: TaskStatus;
  tasks: Schemas['Task'][];
  onMoveTo: (taskId: string, status: TaskStatus) => void;
}

export function BoardColumn({ status, tasks, onMoveTo }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId(status),
    data: { type: 'column', status },
  });

  return (
    <section
      aria-label={statusLabels[status]}
      data-status={status}
      className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-2"
    >
      <header className="flex items-center justify-between px-1 text-sm">
        <h2 className="font-medium">{statusLabels[status]}</h2>
        <span className="text-muted-foreground" aria-label={`${tasks.length} tasks`}>
          {tasks.length}
        </span>
      </header>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={`flex min-h-24 flex-1 flex-col gap-2 rounded-md p-1 transition-colors ${isOver ? 'bg-muted' : ''}`}
        >
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onMoveTo={(next) => onMoveTo(task.id, next)} />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

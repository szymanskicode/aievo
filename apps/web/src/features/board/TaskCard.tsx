import type { Schemas } from '@aievo/api-client';
import { taskStatuses } from '@aievo/shared';
import type { TaskStatus } from '@aievo/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from '@tanstack/react-router';
import { EllipsisVerticalIcon } from 'lucide-react';
import type { SyntheticEvent } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { priorityLabels, statusLabels, typeLabels } from '@/features/tasks/labels';

type Task = Schemas['Task'];

/** Keys and clicks on the card's own controls must not start dragging the card. */
const stopDrag = (event: SyntheticEvent) => event.stopPropagation();

function TaskCardBody({ task }: { task: Task }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant="secondary">{typeLabels[task.type]}</Badge>
      {task.priority !== 'medium' && (
        <Badge variant={task.priority === 'high' ? 'destructive' : 'outline'}>
          {priorityLabels[task.priority]} priority
        </Badge>
      )}
      {task.labels.map((label) => (
        <Badge key={label} variant="outline">
          {label}
        </Badge>
      ))}
    </div>
  );
}

/** How a card looks while it follows the pointer. */
export function TaskCardPreview({ task }: { task: Task }) {
  return (
    <div className="flex cursor-grabbing flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-lg">
      <span className="font-medium">{task.title}</span>
      <TaskCardBody task={task} />
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  onMoveTo: (status: TaskStatus) => void;
}

export function TaskCard({ task, onMoveTo }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task' },
    // A list item, not a button: the card contains its own link and menu button.
    attributes: { role: 'listitem', roleDescription: 'draggable task' },
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={task.title}
      data-testid="task-card"
      className={`flex cursor-grab touch-none flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/projects/$projectId"
          params={{ projectId: task.projectId }}
          search={{ task: task.id }}
          className="font-medium hover:underline"
          onKeyDown={stopDrag}
        >
          {task.title}
        </Link>
        <span onKeyDown={stopDrag} onPointerDown={stopDrag}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${task.title}`}>
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {taskStatuses
                .filter((status) => status !== task.status)
                .map((status) => (
                  <DropdownMenuItem key={status} onSelect={() => onMoveTo(status)}>
                    {statusLabels[status]}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
      <TaskCardBody task={task} />
    </li>
  );
}

import type { Schemas } from '@aievo/api-client';
import { taskStatuses } from '@aievo/shared';
import type { TaskStatus } from '@aievo/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from '@tanstack/react-router';
import { EllipsisVerticalIcon, GitPullRequestIcon, LoaderCircleIcon } from 'lucide-react';
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
import { isOpenRun } from '@/features/runs/run-status';
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
      className={`flex cursor-grab touch-manipulation flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${isDragging ? 'opacity-40' : ''}`}
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
      <TaskCardRun task={task} />
    </li>
  );
}

/** Whether an agent works on the task now, and the pull request of its latest run. */
function TaskCardRun({ task }: { task: Task }) {
  const run = task.latestRun;
  if (!run) return null;
  const active = isOpenRun(run.status);
  if (!active && !run.prUrl) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      onKeyDown={stopDrag}
      onPointerDown={stopDrag}
    >
      {active && (
        <Badge variant="secondary">
          <LoaderCircleIcon className="animate-spin" aria-hidden />
          Agent working
        </Badge>
      )}
      {run.prUrl && (
        <a
          href={run.prUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          <GitPullRequestIcon className="size-3" aria-hidden />
          PR #{run.prNumber}
        </a>
      )}
    </div>
  );
}

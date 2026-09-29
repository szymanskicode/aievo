import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronLeftIcon, PlusIcon } from 'lucide-react';

import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { Button } from '@/components/ui/button';
import { projectQuery } from '@/features/projects/queries';
import { tasksQuery } from '@/features/tasks/queries';
import { TaskSheet } from '@/features/tasks/TaskSheet';

import { Board } from './Board';

interface BoardPageProps {
  projectId: string;
  /** The `task` search parameter: which task the side panel shows, if any. */
  task: string | undefined;
}

export function BoardPage({ projectId, task }: BoardPageProps) {
  const project = useQuery(projectQuery(projectId));
  const tasks = useQuery(tasksQuery(projectId));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          to="/projects"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          Projects
        </Link>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">{project.data?.name ?? 'Project'}</h1>
          {project.isSuccess && (
            <Button asChild>
              <Link to="/projects/$projectId" params={{ projectId }} search={{ task: 'new' }}>
                <PlusIcon />
                New task
              </Link>
            </Button>
          )}
        </div>
        {project.data?.description && (
          <p className="text-sm text-muted-foreground">{project.data.description}</p>
        )}
      </header>

      {project.isPending || tasks.isPending ? (
        <LoadingState label="Loading tasks" />
      ) : project.isError ? (
        <ErrorState
          error={project.error}
          title="Could not load the project"
          onRetry={() => void project.refetch()}
        />
      ) : tasks.isError ? (
        <ErrorState
          error={tasks.error}
          title="Could not load tasks"
          onRetry={() => void tasks.refetch()}
        />
      ) : (
        <>
          {tasks.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tasks yet. Add the first one with “New task”.
            </p>
          )}
          <Board projectId={projectId} tasks={tasks.data} />
          <TaskSheet projectId={projectId} task={task} />
        </>
      )}
    </div>
  );
}

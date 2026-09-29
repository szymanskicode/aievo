import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { withoutUndefined } from '@/lib/without-undefined';

import { taskQuery, useCreateTask, useUpdateTask } from './queries';
import { TaskForm } from './TaskForm';
import type { TaskFormValues } from './TaskForm';

interface TaskSheetProps {
  projectId: string;
  /** `'new'` to create a task, a task id to edit it, `undefined` when closed. */
  task: string | undefined;
}

function EditTask({
  projectId,
  taskId,
  onDone,
}: {
  projectId: string;
  taskId: string;
  onDone: () => void;
}) {
  const task = useQuery(taskQuery(taskId));
  const updateTask = useUpdateTask(projectId);

  if (task.isPending) return <LoadingState label="Loading task" />;
  if (task.isError) {
    return (
      <ErrorState
        error={task.error}
        title="Could not load the task"
        onRetry={() => void task.refetch()}
      />
    );
  }
  // A `?task=` id from another project must not be edited (and saved) from this board.
  if (task.data.projectId !== projectId) {
    return (
      <EmptyState title="Task not found" description="This task belongs to another project." />
    );
  }

  async function save(_values: TaskFormValues, changed: Partial<TaskFormValues>) {
    if (Object.keys(changed).length > 0) {
      await updateTask.mutateAsync({ id: taskId, patch: withoutUndefined(changed) });
      toast.success('Task saved');
    }
    onDone();
  }

  // Keyed by version, so a refetched task resets the form instead of mixing old and new values.
  return <TaskForm key={task.data.updatedAt} task={task.data} onSubmit={save} onCancel={onDone} />;
}

function CreateTask({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const createTask = useCreateTask(projectId);

  async function save(values: TaskFormValues) {
    const task = await createTask.mutateAsync(withoutUndefined(values));
    toast.success(`Task "${task.title}" created`);
    onDone();
  }

  return <TaskForm onSubmit={save} onCancel={onDone} />;
}

/** Side panel with the task form, opened by the `task` search parameter of the board. */
export function TaskSheet({ projectId, task }: TaskSheetProps) {
  const navigate = useNavigate();
  const close = () =>
    void navigate({ to: '/projects/$projectId', params: { projectId }, search: {} });

  return (
    <Sheet open={task !== undefined} onOpenChange={(open) => !open && close()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{task === 'new' ? 'New task' : 'Edit task'}</SheetTitle>
          <SheetDescription>
            {task === 'new'
              ? 'Describe what should be done and how to tell it is done.'
              : 'Changes are saved when you click “Save changes”.'}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {task === 'new' ? (
            <CreateTask projectId={projectId} onDone={close} />
          ) : task ? (
            <EditTask projectId={projectId} taskId={task} onDone={close} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

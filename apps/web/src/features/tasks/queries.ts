import { unwrap } from '@aievo/api-client';
import type { Schemas } from '@aievo/api-client';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/api/client';
import { errorMessage } from '@/api/errors';

type Task = Schemas['Task'];

export const taskKeys = {
  list: (projectId: string) => ['projects', projectId, 'tasks'] as const,
  detail: (id: string) => ['tasks', id] as const,
};

export const tasksQuery = (projectId: string) =>
  queryOptions({
    queryKey: taskKeys.list(projectId),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/projects/{id}/tasks', { params: { path: { id: projectId } }, signal })),
  });

export const taskQuery = (id: string) =>
  queryOptions({
    queryKey: taskKeys.detail(id),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/tasks/{id}', { params: { path: { id } }, signal })),
  });

export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['CreateTask']) =>
      unwrap(api.POST('/api/projects/{id}/tasks', { params: { path: { id: projectId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.list(projectId) }),
  });
}

export function useUpdateTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Schemas['UpdateTask'] }) =>
      unwrap(api.PATCH('/api/tasks/{id}', { params: { path: { id } }, body: patch })),
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      return queryClient.invalidateQueries({ queryKey: taskKeys.list(projectId) });
    },
  });
}

interface MoveTaskVariables {
  taskId: string;
  patch: Pick<Task, 'status' | 'position'>;
  /** The board as it looks after the move, shown before the API answers. */
  optimistic: Task[];
}

/**
 * Moves a card on the board. The board changes at once; if the API rejects the move, the
 * previous board comes back and the error is shown.
 */
export function useMoveTask(projectId: string) {
  const queryClient = useQueryClient();
  const queryKey = taskKeys.list(projectId);

  return useMutation({
    mutationFn: ({ taskId, patch }: MoveTaskVariables) =>
      unwrap(api.PATCH('/api/tasks/{id}', { params: { path: { id: taskId } }, body: patch })),
    onMutate: async ({ optimistic }) => {
      // A refetch in flight would overwrite the optimistic board with the old one.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Task[]>(queryKey);
      queryClient.setQueryData(queryKey, optimistic);
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(`Could not move the task: ${errorMessage(error)}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

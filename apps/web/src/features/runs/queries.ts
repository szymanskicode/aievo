import { unwrap } from '@aievo/api-client';
import type { Schemas } from '@aievo/api-client';
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/api/client';
import { taskKeys } from '@/features/tasks/queries';

import { RUN_POLL_MS, isOpenRun } from './run-status';

type Run = Schemas['Run'];

/** Tool calls each step comes with; the rest is loaded on demand. */
export const FIRST_TOOL_CALLS = 100;

export const runKeys = {
  // Under the task's key (`taskKeys.detail`): invalidating a task refreshes its runs too.
  ofTask: (taskId: string) => ['tasks', taskId, 'runs'] as const,
  detail: (id: string) => ['runs', id] as const,
  steps: (id: string) => ['runs', id, 'steps'] as const,
  moreToolCalls: (stepId: string, after: string) => ['steps', stepId, 'tool-calls', after] as const,
};

export const taskRunsQuery = (taskId: string) =>
  queryOptions({
    queryKey: runKeys.ofTask(taskId),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/tasks/{id}/runs', { params: { path: { id: taskId } }, signal })),
    refetchInterval: (query) =>
      query.state.data?.some((run) => isOpenRun(run.status)) ? RUN_POLL_MS : false,
  });

export const runQuery = (id: string) =>
  queryOptions({
    queryKey: runKeys.detail(id),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/runs/{id}', { params: { path: { id } }, signal })),
    refetchInterval: (query) =>
      query.state.data && isOpenRun(query.state.data.status) ? RUN_POLL_MS : false,
  });

/** Steps are polled only while their run is open (`poll`). */
export const runStepsQuery = (id: string, poll: boolean) =>
  queryOptions({
    queryKey: runKeys.steps(id),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/runs/{id}/steps', {
          params: { path: { id }, query: { toolCallLimit: FIRST_TOOL_CALLS } },
          signal,
        }),
      ),
    refetchInterval: poll ? RUN_POLL_MS : false,
  });

/** Tool calls of a step after its first page, loaded page by page. */
export const moreToolCallsQuery = (stepId: string, after: string) =>
  infiniteQueryOptions({
    queryKey: runKeys.moreToolCalls(stepId, after),
    initialPageParam: after,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/api/steps/{id}/tool-calls', {
          params: { path: { id: stepId }, query: { after: pageParam, limit: FIRST_TOOL_CALLS } },
          signal,
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

export function useStartRun(task: Pick<Schemas['Task'], 'id' | 'projectId'>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/tasks/{id}/runs', { params: { path: { id: task.id } } })),
    onSuccess: (run) => {
      queryClient.setQueryData(runKeys.detail(run.id), run);
      // The task moved to "running" and has a new latest run (its runs share its key).
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) }),
        queryClient.invalidateQueries({ queryKey: taskKeys.list(task.projectId) }),
      ]);
    },
  });
}

export function useCancelRun(run: Pick<Run, 'id' | 'taskId'>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/runs/{id}/cancel', { params: { path: { id: run.id } } })),
    onSuccess: (updated) => {
      queryClient.setQueryData(runKeys.detail(updated.id), updated);
      return queryClient.invalidateQueries({ queryKey: runKeys.ofTask(run.taskId) });
    },
  });
}

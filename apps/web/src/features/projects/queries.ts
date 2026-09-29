import { unwrap } from '@aievo/api-client';
import type { Schemas } from '@aievo/api-client';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api/client';
import { AFFECTS_SETUP } from '@/api/query-client';

export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
  templates: ['templates'] as const,
};

export const templatesQuery = () =>
  queryOptions({
    queryKey: projectKeys.templates,
    queryFn: ({ signal }) => unwrap(api.GET('/api/templates', { signal })),
    // Templates ship with the API build; they do not change while the app runs.
    staleTime: Infinity,
  });

export const projectsQuery = () =>
  queryOptions({
    queryKey: projectKeys.all,
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects', { signal })),
  });

export const projectQuery = (id: string) =>
  queryOptions({
    queryKey: projectKeys.detail(id),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/projects/{id}', { params: { path: { id } }, signal })),
  });

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: AFFECTS_SETUP,
    mutationFn: (body: Schemas['CreateProject']) => unwrap(api.POST('/api/projects', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: AFFECTS_SETUP,
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/projects/{id}', { params: { path: { id } } })),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(id) });
      return queryClient.invalidateQueries({ queryKey: projectKeys.all, exact: true });
    },
  });
}

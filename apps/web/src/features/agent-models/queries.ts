import { unwrap } from '@aievo/api-client';
import type { Schemas } from '@aievo/api-client';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api/client';
import { providerKeys } from '@/features/providers/queries';

export const workspaceSettingsKey = ['workspace-settings'] as const;

export const workspaceSettingsQuery = () =>
  queryOptions({
    queryKey: workspaceSettingsKey,
    queryFn: ({ signal }) => unwrap(api.GET('/api/workspace/settings', { signal })),
  });

/** Models of every provider, for choosing the model of an agent. */
export const allModelsQuery = () =>
  queryOptions({
    queryKey: providerKeys.allModels,
    queryFn: ({ signal }) => unwrap(api.GET('/api/models', { signal })),
  });

export function useUpdateAgentModels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentModels: NonNullable<Schemas['UpdateWorkspaceSettings']['agentModels']>) =>
      unwrap(api.PATCH('/api/workspace/settings', { body: { agentModels } })),
    onSuccess: (settings) => queryClient.setQueryData(workspaceSettingsKey, settings),
  });
}

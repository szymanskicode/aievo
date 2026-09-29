import { unwrap } from '@aievo/api-client';
import type { Schemas } from '@aievo/api-client';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/api/client';
import { AFFECTS_SETUP } from '@/api/query-client';
import { errorMessage } from '@/api/errors';

type Model = Schemas['Model'];

export const providerKeys = {
  types: ['provider-types'] as const,
  all: ['providers'] as const,
  /** Every model list, of one provider or of all; a model change invalidates them together. */
  allLists: ['models'] as const,
  models: (providerId: string) => ['models', { providerId }] as const,
  allModels: ['models', 'all'] as const,
};

export const providerTypesQuery = () =>
  queryOptions({
    queryKey: providerKeys.types,
    queryFn: ({ signal }) => unwrap(api.GET('/api/provider-types', { signal })),
    // The registry is part of the API build; it does not change while the app runs.
    staleTime: Infinity,
  });

export const providersQuery = () =>
  queryOptions({
    queryKey: providerKeys.all,
    queryFn: ({ signal }) => unwrap(api.GET('/api/providers', { signal })),
  });

export const modelsQuery = (providerId: string) =>
  queryOptions({
    queryKey: providerKeys.models(providerId),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/models', { params: { query: { providerId } }, signal })),
  });

export function useCreateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: AFFECTS_SETUP,
    mutationFn: (body: Schemas['CreateProvider']) => unwrap(api.POST('/api/providers', { body })),
    // The variables hold the plaintext key: drop the finished mutation from the cache at once.
    gcTime: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providerKeys.all }),
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: AFFECTS_SETUP,
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/providers/{id}', { params: { path: { id } } })),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: providerKeys.models(id) });
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: providerKeys.all }),
        queryClient.invalidateQueries({ queryKey: providerKeys.allModels }),
      ]);
    },
  });
}

/** Tests the connection; the models it discovers replace the cached list of the provider. */
export function useTestProvider(providerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: AFFECTS_SETUP,
    mutationFn: () =>
      unwrap(api.POST('/api/providers/{id}/test', { params: { path: { id: providerId } } })),
    onSuccess: (result) => {
      queryClient.setQueryData(providerKeys.models(providerId), result.models);
      return queryClient.invalidateQueries({ queryKey: providerKeys.allModels });
    },
  });
}

/** Turns a model on or off at once; if the API rejects it, the switch goes back. */
export function useSetModelEnabled(providerId: string) {
  const queryClient = useQueryClient();
  const queryKey = providerKeys.models(providerId);

  return useMutation({
    meta: AFFECTS_SETUP,
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      unwrap(api.PATCH('/api/models/{id}', { params: { path: { id } }, body: { enabled } })),
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Model[]>(queryKey);
      queryClient.setQueryData<Model[]>(queryKey, (models) =>
        models?.map((model) => (model.id === id ? { ...model, enabled } : model)),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(`Could not update the model: ${errorMessage(error)}`);
    },
    // Also the list of all models, which the Models settings page chooses from.
    onSettled: () => queryClient.invalidateQueries({ queryKey: providerKeys.allLists }),
  });
}

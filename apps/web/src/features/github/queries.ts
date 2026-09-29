import { unwrap } from '@aievo/api-client';
import type { Schemas } from '@aievo/api-client';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api/client';
import { AFFECTS_SETUP } from '@/api/query-client';

export const githubKeys = {
  credentials: ['git-credentials'] as const,
  owners: (credentialId: string | undefined) => ['github', 'owners', { credentialId }] as const,
  repos: (owner: string, credentialId: string | undefined) =>
    ['github', 'repos', { owner, credentialId }] as const,
};

export const gitCredentialsQuery = () =>
  queryOptions({
    queryKey: githubKeys.credentials,
    queryFn: ({ signal }) => unwrap(api.GET('/api/git-credentials', { signal })),
  });

/** `credentialId` may be left out when the workspace has exactly one token. */
const credentialQuery = (credentialId: string | undefined) =>
  credentialId === undefined ? {} : { credentialId };

export const githubOwnersQuery = (credentialId: string | undefined) =>
  queryOptions({
    queryKey: githubKeys.owners(credentialId),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/github/owners', {
          params: { query: credentialQuery(credentialId) },
          signal,
        }),
      ),
  });

export const githubReposQuery = (owner: string, credentialId: string | undefined) =>
  queryOptions({
    queryKey: githubKeys.repos(owner, credentialId),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/github/repos', {
          params: { query: { owner, ...credentialQuery(credentialId) } },
          signal,
        }),
      ),
  });

export function useCreateGitCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: AFFECTS_SETUP,
    mutationFn: (body: Schemas['CreateGitCredential']) =>
      unwrap(api.POST('/api/git-credentials', { body })),
    // The variables hold the plaintext token: drop the finished mutation from the cache at once.
    gcTime: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: githubKeys.credentials }),
  });
}

export function useDeleteGitCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: AFFECTS_SETUP,
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/git-credentials/{id}', { params: { path: { id } } })),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['github'] });
      return queryClient.invalidateQueries({ queryKey: githubKeys.credentials });
    },
  });
}

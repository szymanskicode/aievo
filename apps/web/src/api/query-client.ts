import { ApiClientError } from '@aievo/api-client';
import { MutationCache, QueryClient } from '@tanstack/react-query';

const MAX_RETRIES = 1;

/** Cache key of the first-run checklist (`GET /api/setup-status`). */
export const SETUP_STATUS_KEY = ['setup-status'] as const;

/**
 * Marks a mutation whose success can complete a first-run step (a provider, a model switch,
 * a GitHub token, a project), so the checklist is refreshed after it.
 */
export const AFFECTS_SETUP = { affectsSetup: true } as const;

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { affectsSetup?: boolean };
  }
}

/** Only failures that may pass on their own are retried: no connection or a 5xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!(error instanceof ApiClientError)) return false;
  return error.status === 0 || error.status >= 500;
}

export function createQueryClient(): QueryClient {
  const queryClient: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      // Not awaited: the mutation itself does not wait for the checklist.
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.affectsSetup) {
          void queryClient.invalidateQueries({ queryKey: SETUP_STATUS_KEY });
        }
      },
    }),
    defaultOptions: {
      queries: {
        // The only writer is this UI, which invalidates what it changes.
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
      },
      mutations: {
        // Writes are not idempotent in general; the user retries them.
        retry: false,
      },
    },
  });
  return queryClient;
}

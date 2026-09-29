import { ApiClientError } from '@aievo/api-client';
import { QueryClient } from '@tanstack/react-query';

const MAX_RETRIES = 1;

/** Only failures that may pass on their own are retried: no connection or a 5xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!(error instanceof ApiClientError)) return false;
  return error.status === 0 || error.status >= 500;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
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
}

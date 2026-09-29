import { ApiClientError } from '@aievo/api-client';

/** A message to show the user; API errors carry their own. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return 'Something went wrong. Try again.';
}

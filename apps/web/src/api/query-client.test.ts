import { ApiClientError } from '@aievo/api-client';
import { describe, expect, it } from 'vitest';

import { shouldRetry } from './query-client';

describe('shouldRetry', () => {
  it('retries a network error or a server error once', () => {
    expect(shouldRetry(0, new ApiClientError(0, 'network_error', 'down'))).toBe(true);
    expect(shouldRetry(0, new ApiClientError(503, 'unavailable', 'busy'))).toBe(true);
    expect(shouldRetry(1, new ApiClientError(503, 'unavailable', 'busy'))).toBe(false);
  });

  it('never retries client errors', () => {
    expect(shouldRetry(0, new ApiClientError(404, 'not_found', 'Project not found'))).toBe(false);
    expect(shouldRetry(0, new ApiClientError(400, 'validation_error', 'Invalid'))).toBe(false);
  });

  it('never retries errors that did not come from the API', () => {
    expect(shouldRetry(0, new Error('bug'))).toBe(false);
  });
});

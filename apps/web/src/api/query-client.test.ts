import { ApiClientError } from '@aievo/api-client';
import type { MutationOptions } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { AFFECTS_SETUP, SETUP_STATUS_KEY, createQueryClient, shouldRetry } from './query-client';

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

describe('createQueryClient', () => {
  /** A client with a cached checklist and a helper that runs one mutation through it. */
  function setup() {
    const queryClient = createQueryClient();
    queryClient.setQueryData(SETUP_STATUS_KEY, {
      modelProvider: false,
      githubToken: false,
      project: false,
    });
    const run = (options: MutationOptions<string>) =>
      queryClient.getMutationCache().build(queryClient, options).execute(undefined);
    const isStale = () => queryClient.getQueryState(SETUP_STATUS_KEY)?.isInvalidated;
    return { run, isStale };
  }

  it('marks the first-run checklist stale after a write that can complete a step', async () => {
    const { run, isStale } = setup();

    await run({ meta: AFFECTS_SETUP, mutationFn: () => Promise.resolve('ok') });

    expect(isStale()).toBe(true);
  });

  it('leaves the checklist alone after other writes, such as moving a task', async () => {
    const { run, isStale } = setup();

    await run({ mutationFn: () => Promise.resolve('ok') });

    expect(isStale()).toBe(false);
  });

  it('leaves the checklist alone when a write fails', async () => {
    const { run, isStale } = setup();

    await expect(
      run({ meta: AFFECTS_SETUP, mutationFn: () => Promise.reject(new Error('no')) }),
    ).rejects.toThrow('no');

    expect(isStale()).toBe(false);
  });
});

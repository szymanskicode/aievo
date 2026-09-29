import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * Intercepts every HTTP request of the test file. A request without a handler fails
 * instead of reaching the network, so no test can call the real GitHub API.
 */
export function useMockGitHub() {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}

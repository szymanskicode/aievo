import { http, passthrough } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

/** supertest talks to the app under test over loopback; those requests must go through. */
const loopback = http.all(/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//, () =>
  passthrough(),
);

/**
 * Intercepts outgoing HTTP of the test file. Apart from loopback, a request without a
 * handler fails instead of reaching the network, so no test can call a real provider.
 * Mocked providers therefore use non-loopback hosts.
 *
 * The built-in 'error' strategy is used on purpose: throwing from a custom
 * `onUnhandledRequest` callback only prints and still lets the request out.
 */
export function useMockProviders() {
  // Initial handlers survive `resetHandlers()`.
  const server = setupServer(loopback);
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}

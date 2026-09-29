import { createApiClient } from '@aievo/api-client';

/**
 * The API client of the app. Paths in the contract already start with `/api`, and the API
 * is served from the page origin (the dev server proxies `/api`).
 * `fetch` is looked up on every call, so a replaced global (e.g. msw in tests) is used.
 */
export const api = createApiClient({
  baseUrl: window.location.origin,
  fetch: (input) => globalThis.fetch(input),
});

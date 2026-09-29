import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { setupStatusFixture } from './fixtures';

/** Absolute URL of an API path, as the app's client requests it. */
export function apiUrl(path: string): string {
  return new URL(`/api${path}`, window.location.origin).toString();
}

/**
 * Answers every page needs through the layout: a fully configured instance, so the
 * first-run checklist stays out of the way unless a test overrides it.
 */
const defaultHandlers = [
  http.get(apiUrl('/setup-status'), () => HttpResponse.json(setupStatusFixture())),
];

/**
 * Mock API for component tests; each test adds its handlers with `server.use`.
 * The default handlers survive `resetHandlers()`.
 */
export const server = setupServer(...defaultHandlers);

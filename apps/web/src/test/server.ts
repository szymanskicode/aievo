import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { setupStatusFixture, workspaceSettingsFixture } from './fixtures';

/** Absolute URL of an API path, as the app's client requests it. */
export function apiUrl(path: string): string {
  return new URL(`/api${path}`, window.location.origin).toString();
}

/**
 * Answers every page needs through the layout: a fully configured instance, so the
 * first-run checklist stays out of the way unless a test overrides it. The task panel
 * always asks for runs and the workspace settings; by default no task has run yet.
 */
const defaultHandlers = [
  http.get(apiUrl('/setup-status'), () => HttpResponse.json(setupStatusFixture())),
  http.get(apiUrl('/workspace/settings'), () => HttpResponse.json(workspaceSettingsFixture())),
  http.get(apiUrl('/tasks/:id/runs'), () => HttpResponse.json([])),
];

/**
 * Mock API for component tests; each test adds its handlers with `server.use`.
 * The default handlers survive `resetHandlers()`.
 */
export const server = setupServer(...defaultHandlers);

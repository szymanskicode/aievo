import { setupServer } from 'msw/node';

/** Mock API for component tests; each test adds its handlers with `server.use`. */
export const server = setupServer();

/** Absolute URL of an API path, as the app's client requests it. */
export function apiUrl(path: string): string {
  return new URL(`/api${path}`, window.location.origin).toString();
}

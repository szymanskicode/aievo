import createClient from 'openapi-fetch';

import type { components, paths } from './generated/schema.js';

export type { components, paths } from './generated/schema.js';
export { ApiClientError, toApiClientError, unwrap } from './errors.js';

/** Schemas of the API by name, e.g. `Schemas['Task']`. */
export type Schemas = components['schemas'];

export interface ApiClientOptions {
  /** Origin and prefix of the API, e.g. `/api` behind the dev proxy. */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient({ baseUrl, fetch }: ApiClientOptions) {
  return createClient<paths>({ baseUrl, ...(fetch ? { fetch } : {}) });
}

export type ApiClient = ReturnType<typeof createApiClient>;

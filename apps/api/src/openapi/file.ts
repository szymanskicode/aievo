import { fileURLToPath } from 'node:url';

import type { OpenApiDocument } from './document.js';

/** `apps/api/openapi.json`, committed so the API client can be generated from it. */
export const OPENAPI_FILE = fileURLToPath(new URL('../../openapi.json', import.meta.url));

export function serializeOpenApiDocument(document: OpenApiDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

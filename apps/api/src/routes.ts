import { z } from 'zod';

import { definePublicRoute } from './http/route.js';
import type { Route } from './http/route.js';
import { gitCredentialRoutes } from './modules/git-credentials/routes.js';
import { githubRoutes } from './modules/github/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { modelRoutes } from './modules/models/routes.js';
import { projectRoutes } from './modules/projects/routes.js';
import { providerRoutes } from './modules/providers/routes.js';
import { taskRoutes } from './modules/tasks/routes.js';
import { buildOpenApiDocument } from './openapi/document.js';
import type { OpenApiDocument } from './openapi/document.js';

/** All API routes live under `/api`. */
export const API_PREFIX = '/api';

let document: OpenApiDocument | undefined;

/** The document describes every route in `apiRoutes`, including the one that serves it. */
export function getOpenApiDocument(): OpenApiDocument {
  document ??= buildOpenApiDocument(apiRoutes, API_PREFIX);
  return document;
}

const openApiRoute = definePublicRoute(
  {
    method: 'get',
    path: '/openapi.json',
    summary: 'OpenAPI 3.1 document of this API',
    tag: 'meta',
    status: 200,
    response: z.looseObject({ openapi: z.string() }),
  },
  () => ({ ...getOpenApiDocument() }),
);

export const apiRoutes: readonly Route[] = [
  ...healthRoutes,
  ...projectRoutes,
  ...taskRoutes,
  ...providerRoutes,
  ...modelRoutes,
  ...gitCredentialRoutes,
  ...githubRoutes,
  openApiRoute,
];

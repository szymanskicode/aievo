import { apiErrorSchema } from '@aievo/shared';
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';

import type { Route } from '../http/route.js';

export type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>;

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Invalid request',
  404: 'Resource not found',
  415: 'Request body is not JSON',
  422: 'The request is valid but cannot be applied',
};

/** `/projects/:id` (Express) → `/projects/{id}` (OpenAPI). */
export function toOpenApiPath(path: string): string {
  return path.replace(/:(\w+)/g, '{$1}');
}

function toRouteConfig(route: Route, prefix: string): RouteConfig {
  const { spec } = route;
  const errors = new Set(spec.errors);
  if (spec.params || spec.query || spec.body) errors.add(400);
  if (spec.body) errors.add(415);

  const responses: RouteConfig['responses'] = {
    [spec.status]: spec.response
      ? {
          description: spec.summary,
          content: { 'application/json': { schema: spec.response } },
        }
      : { description: spec.summary },
  };

  for (const status of [...errors].sort((a, b) => a - b)) {
    responses[status] = {
      description: ERROR_DESCRIPTIONS[status] ?? 'Error',
      content: { 'application/json': { schema: apiErrorSchema } },
    };
  }

  return {
    method: spec.method,
    path: toOpenApiPath(`${prefix}${spec.path}`),
    summary: spec.summary,
    tags: [spec.tag],
    request: {
      ...(spec.params ? { params: spec.params } : {}),
      ...(spec.query ? { query: spec.query } : {}),
      ...(spec.body
        ? { body: { required: true, content: { 'application/json': { schema: spec.body } } } }
        : {}),
    },
    responses,
  };
}

/** Builds the OpenAPI 3.1 document from the same route contracts that Express serves. */
export function buildOpenApiDocument(routes: readonly Route[], prefix: string): OpenApiDocument {
  // Named components come from the `.meta({ id })` of the shared schemas.
  const registry = new OpenAPIRegistry();
  for (const route of routes) {
    registry.registerPath(toRouteConfig(route, prefix));
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'AIEvo API',
      version: '0.1.0',
      description: 'REST API of AIEvo. Errors use `{ error: { code, message, details? } }`.',
    },
  });
}

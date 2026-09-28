import { healthResponseSchema } from '@aievo/shared';

import { definePublicRoute } from '../../http/route.js';

export const healthRoutes = [
  definePublicRoute(
    {
      method: 'get',
      path: '/health',
      summary: 'Check that the API is up',
      tag: 'health',
      status: 200,
      response: healthResponseSchema,
    },
    () => ({ status: 'ok' as const }),
  ),
];

import { listTemplates } from '@aievo/presets';
import { templateSchema } from '@aievo/shared';
import { z } from 'zod';

import { defineRoute } from '../../http/route.js';

export const templateRoutes = [
  defineRoute(
    {
      method: 'get',
      path: '/templates',
      summary: 'List the templates a new repository can start from',
      tag: 'templates',
      status: 200,
      response: z.array(templateSchema),
    },
    () => listTemplates(),
  ),
];

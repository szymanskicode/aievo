import { getSetupStatus } from '@aievo/db';
import { setupStatusSchema } from '@aievo/shared';

import { defineRoute } from '../../http/route.js';

export const setupRoutes = [
  defineRoute(
    {
      method: 'get',
      path: '/setup-status',
      summary: 'First-run checklist: which configuration steps the workspace has completed',
      tag: 'setup',
      status: 200,
      response: setupStatusSchema,
    },
    ({ db, workspaceId }) => getSetupStatus(db, workspaceId),
  ),
];

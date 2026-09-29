import { listModels, updateModel } from '@aievo/db';
import {
  idParamsSchema,
  modelListQuerySchema,
  modelSchema,
  updateModelSchema,
  withoutUndefined,
} from '@aievo/shared';
import { z } from 'zod';

import { resourceNotFound } from '../../errors.js';
import { defineRoute } from '../../http/route.js';
import { serializeModel } from './serialize.js';

const tag = 'models';

export const modelRoutes = [
  defineRoute(
    {
      method: 'get',
      path: '/models',
      summary: 'List models of all providers, or of one provider',
      tag,
      query: modelListQuerySchema,
      status: 200,
      response: z.array(modelSchema),
    },
    async ({ db, workspaceId, query }) =>
      (await listModels(db, workspaceId, withoutUndefined(query))).map(serializeModel),
  ),

  defineRoute(
    {
      method: 'patch',
      path: '/models/:id',
      summary: 'Update capabilities, prices or availability of a model',
      tag,
      params: idParamsSchema,
      body: updateModelSchema,
      status: 200,
      response: modelSchema,
      errors: [404],
    },
    async ({ db, workspaceId, params, body }) => {
      const { capabilities, ...rest } = body;
      const row = await updateModel(db, workspaceId, params.id, {
        ...withoutUndefined(rest),
        ...(capabilities === undefined ? {} : { capabilities: withoutUndefined(capabilities) }),
      });
      if (!row) throw resourceNotFound('Model');
      return serializeModel(row);
    },
  ),
];

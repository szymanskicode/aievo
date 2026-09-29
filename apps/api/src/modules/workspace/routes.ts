import { getWorkspaceSettings, updateWorkspaceSettings } from '@aievo/db';
import { updateWorkspaceSettingsSchema, workspaceSettingsResponseSchema } from '@aievo/shared';

import { ApiError } from '../../errors.js';
import { defineRoute } from '../../http/route.js';
import { assertModelUsable, coderPreset } from './agent-model.js';

const tag = 'workspace';

function workspaceMissing(): ApiError {
  return new ApiError(404, 'not_found', 'Workspace not found');
}

export const workspaceRoutes = [
  defineRoute(
    {
      method: 'get',
      path: '/workspace/settings',
      summary: 'Settings of the workspace, such as the model of each agent role',
      tag,
      status: 200,
      response: workspaceSettingsResponseSchema,
      errors: [404],
    },
    async ({ db, workspaceId }) => {
      const settings = await getWorkspaceSettings(db, workspaceId);
      if (!settings) throw workspaceMissing();
      return settings;
    },
  ),

  defineRoute(
    {
      method: 'patch',
      path: '/workspace/settings',
      summary:
        'Change settings of the workspace. The model of the Programista agent must be enabled, ' +
        'priced and have the capabilities the agent requires (422 otherwise); `null` clears it.',
      tag,
      body: updateWorkspaceSettingsSchema,
      status: 200,
      response: workspaceSettingsResponseSchema,
      errors: [404, 422],
    },
    async ({ db, workspaceId, body }) => {
      const coder = body.agentModels?.coder;
      // Checked before the write, not in its transaction: a model disabled in between is
      // caught when a run is started and again by the worker.
      if (coder) await assertModelUsable(db, workspaceId, coder, await coderPreset());
      const settings = await updateWorkspaceSettings(db, workspaceId, body);
      if (!settings) throw workspaceMissing();
      return settings;
    },
  ),
];

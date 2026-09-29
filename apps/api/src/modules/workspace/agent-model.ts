import { checkModelForAgent, getWorkspaceSettings } from '@aievo/db';
import type { Db } from '@aievo/db';
import { loadAgentPreset } from '@aievo/presets';
import type { LoadedAgentPreset } from '@aievo/presets';
import { chosenAgentModel } from '@aievo/shared';

import { ApiError } from '../../errors.js';

let coder: Promise<LoadedAgentPreset> | undefined;

/** The Programista preset; read once, it only changes with a new build of AIEvo. */
export function coderPreset(): Promise<LoadedAgentPreset> {
  coder ??= loadAgentPreset('coder').catch((error: unknown) => {
    coder = undefined;
    throw error;
  });
  return coder;
}

/** Refuses (422) a model the agent of `preset` cannot run on; used when the setting is saved. */
export async function assertModelUsable(
  db: Db,
  workspaceId: string,
  modelId: string,
  { preset }: LoadedAgentPreset,
): Promise<void> {
  const check = await checkModelForAgent(db, workspaceId, modelId, preset.requiredCapabilities);
  if (check.status === 'unusable') throw new ApiError(422, 'model_not_usable', check.reason);
}

/**
 * Checks, before a run is queued, that a model is chosen for the agent and can still run it
 * (409 otherwise); the worker checks again when the run starts.
 */
export async function assertAgentModelReady(
  db: Db,
  workspaceId: string,
  { preset }: LoadedAgentPreset,
): Promise<void> {
  const settings = await getWorkspaceSettings(db, workspaceId);
  const modelId = settings ? chosenAgentModel(settings, preset.key) : null;
  const check = await checkModelForAgent(db, workspaceId, modelId, preset.requiredCapabilities);
  if (check.status === 'not_chosen') {
    throw new ApiError(
      409,
      'agent_model_missing',
      `Choose the model for the ${preset.name} agent in the workspace settings first`,
    );
  }
  if (check.status === 'unusable') {
    throw new ApiError(
      409,
      'agent_model_unusable',
      `The model chosen for the ${preset.name} agent cannot be used: ${check.reason}`,
    );
  }
}

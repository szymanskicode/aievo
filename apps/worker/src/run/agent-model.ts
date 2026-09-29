import { checkModelForAgent, getProvider, getWorkspaceSettings } from '@aievo/db';
import type { Db } from '@aievo/db';
import { createLlmClient } from '@aievo/llm';
import type { LlmClient, LlmClientOptions, ModelPricing } from '@aievo/llm';
import type { LoadedAgentPreset } from '@aievo/presets';
import { chosenAgentModel } from '@aievo/shared';
import type { SecretBox } from '@aievo/shared/crypto';

import { RunFailure } from './run-failure.js';

/** The model an agent step runs on, with a client that already holds the provider key. */
export interface AgentModel {
  llm: LlmClient;
  /** The provider's model id, e.g. `claude-sonnet-5-5`. */
  modelId: string;
  displayName: string;
  pricing: ModelPricing;
}

/** Resolves the model the workspace chose for the agent of `loaded` for one run. */
export type OpenAgentModel = (
  workspaceId: string,
  loaded: LoadedAgentPreset,
) => Promise<AgentModel>;

export function createAgentModelOpener(
  db: Db,
  secretBox: SecretBox,
  llmOptions: LlmClientOptions = {},
): OpenAgentModel {
  return async (workspaceId, { preset }) => {
    const settings = await getWorkspaceSettings(db, workspaceId);
    const modelId = settings ? chosenAgentModel(settings, preset.key) : null;
    const check = await checkModelForAgent(db, workspaceId, modelId, preset.requiredCapabilities);
    if (check.status === 'not_chosen') {
      throw new RunFailure(
        'agent_model_missing',
        `No model is chosen for the ${preset.name} agent in the workspace settings`,
      );
    }
    if (check.status === 'unusable') {
      throw new RunFailure(
        'agent_model_unusable',
        `The model chosen for the ${preset.name} agent cannot be used: ${check.reason}`,
      );
    }
    const { model } = check;
    const provider = await getProvider(db, workspaceId, model.providerId);
    if (!provider) {
      throw new RunFailure('agent_model_unusable', 'The provider of the chosen model was removed');
    }

    let apiKey: string | null = null;
    if (provider.encryptedKey !== null) {
      try {
        apiKey = secretBox.decrypt(provider.encryptedKey);
      } catch (error) {
        throw new RunFailure(
          'provider_key_unreadable',
          `The stored key of the provider "${provider.label}" cannot be decrypted (was AIEVO_MASTER_KEY changed?)`,
          { cause: error },
        );
      }
    }

    return {
      // The key stays inside the client; it is not kept anywhere else.
      llm: createLlmClient({ type: provider.type, apiKey, baseUrl: provider.baseUrl }, llmOptions),
      modelId: model.modelId,
      displayName: model.displayName,
      // `checkAgentModel` refused models without prices.
      pricing: { inputUsdPerMTok: model.priceIn ?? 0, outputUsdPerMTok: model.priceOut ?? 0 },
    };
  };
}

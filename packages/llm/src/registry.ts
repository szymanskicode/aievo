import { providerTypeInfo } from '@aievo/shared';
import type { ProviderType, ProviderTypeInfo } from '@aievo/shared';

import type { ProviderAdapter } from './providers/adapter.js';
import { anthropicAdapter } from './providers/anthropic.js';
import { openAiCompatibleAdapter } from './providers/openai-compatible.js';
import { openAiAdapter } from './providers/openai.js';
import type { DiscoveredModel, ProviderCredentialInput, RequestOptions } from './types.js';

export interface ProviderTypeDefinition extends ProviderTypeInfo {
  adapter: ProviderAdapter;
}

/** Every supported provider type: its required fields and its adapter. */
export const providerRegistry: Readonly<Record<ProviderType, ProviderTypeDefinition>> = {
  anthropic: { ...providerTypeInfo.anthropic, adapter: anthropicAdapter },
  openai: { ...providerTypeInfo.openai, adapter: openAiAdapter },
  'openai-compatible': {
    ...providerTypeInfo['openai-compatible'],
    adapter: openAiCompatibleAdapter,
  },
};

/**
 * Fetches the models available with this credential. Doubles as the connection test:
 * it fails with a `ProviderError` when the key or the base URL is wrong.
 */
export function discoverModels(
  credential: ProviderCredentialInput,
  options?: RequestOptions,
): Promise<DiscoveredModel[]> {
  return providerRegistry[credential.type].adapter.listModels(credential, options);
}

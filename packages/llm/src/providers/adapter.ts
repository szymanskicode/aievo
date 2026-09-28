import type { ProviderType } from '@aievo/shared';
import type { LanguageModel } from 'ai';

import type { DiscoveredModel, ProviderCredentialInput, RequestOptions } from '../types.js';

/**
 * One provider type. Adding a type means writing one adapter and registering it;
 * the fields it needs are described in `providerTypeInfo` (`@aievo/shared`).
 */
export interface ProviderAdapter {
  type: ProviderType;
  /** Model list from the provider API, with the capabilities it reveals. */
  listModels(
    credential: ProviderCredentialInput,
    options?: RequestOptions,
  ): Promise<DiscoveredModel[]>;
  /** Vercel AI SDK model used by `LlmClient`. */
  createModel(credential: ProviderCredentialInput, modelId: string): LanguageModel;
}

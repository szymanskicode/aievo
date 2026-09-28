import type { ModelCapabilities, ProviderType } from '@aievo/shared';

/** A provider with its key already decrypted. Lives only for the duration of a call. */
export interface ProviderCredentialInput {
  type: ProviderType;
  apiKey: string | null;
  baseUrl: string | null;
}

/** A model reported by a provider, with the capabilities that could be determined. */
export interface DiscoveredModel {
  modelId: string;
  displayName: string;
  capabilities: ModelCapabilities;
  /** `false` for models that are evidently not chat models (embeddings, speech…). */
  enabled: boolean;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Defaults to `DEFAULT_TIMEOUT_MS`. */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

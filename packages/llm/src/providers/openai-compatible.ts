import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import { resolveBaseUrl } from '../http.js';
import type { ProviderAdapter } from './adapter.js';
import { listOpenAiFormatModels } from './openai-models.js';

/** Any server with the OpenAI API (Ollama, LM Studio, OpenRouter, vLLM…); the key is optional. */
export const openAiCompatibleAdapter: ProviderAdapter = {
  type: 'openai-compatible',
  listModels: listOpenAiFormatModels,
  createModel(credential, modelId) {
    return createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: resolveBaseUrl(credential),
      ...(credential.apiKey ? { apiKey: credential.apiKey } : {}),
      includeUsage: true,
    }).chatModel(modelId);
  },
};

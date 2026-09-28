import { createOpenAI } from '@ai-sdk/openai';

import { ProviderError } from '../errors.js';
import { resolveBaseUrl } from '../http.js';
import type { ProviderAdapter } from './adapter.js';
import { listOpenAiFormatModels } from './openai-models.js';

export const openAiAdapter: ProviderAdapter = {
  type: 'openai',
  async listModels(credential, options) {
    if (!credential.apiKey) throw new ProviderError('unauthorized');
    return listOpenAiFormatModels(credential, options);
  },
  createModel(credential, modelId) {
    if (!credential.apiKey) throw new ProviderError('unauthorized');
    return createOpenAI({ apiKey: credential.apiKey, baseURL: resolveBaseUrl(credential) })(
      modelId,
    );
  },
};

import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

import { capabilities, positiveInt } from '../capabilities.js';
import { ProviderError } from '../errors.js';
import { getJson, resolveBaseUrl } from '../http.js';
import type { DiscoveredModel, ProviderCredentialInput, RequestOptions } from '../types.js';
import type { ProviderAdapter } from './adapter.js';

const ANTHROPIC_VERSION = '2023-06-01';
const PAGE_SIZE = 1000;
// Guards against a provider that keeps answering `has_more: true`.
const MAX_PAGES = 20;

// Loose on purpose: unknown fields are ignored and optional ones are used when present.
const pageSchema = z.object({
  data: z.array(
    z.looseObject({
      id: z.string().min(1),
      display_name: z.string().optional(),
      max_input_tokens: z.unknown().optional(),
      max_tokens: z.unknown().optional(),
    }),
  ),
  has_more: z.boolean().optional(),
  last_id: z.string().nullable().optional(),
});

/**
 * Every model served by the Anthropic API supports tool use, image input, structured
 * output and prompt caching, so these are set for the whole provider type. Reasoning
 * differs per model and is left for the user to enable.
 */
const ANTHROPIC_DEFAULTS = {
  tools: true,
  vision: true,
  structuredOutput: true,
  promptCaching: true,
};

function requireKey(credential: ProviderCredentialInput): string {
  if (!credential.apiKey) throw new ProviderError('unauthorized');
  return credential.apiKey;
}

async function listModels(
  credential: ProviderCredentialInput,
  options?: RequestOptions,
): Promise<DiscoveredModel[]> {
  const baseUrl = resolveBaseUrl(credential);
  const headers = { 'x-api-key': requireKey(credential), 'anthropic-version': ANTHROPIC_VERSION };
  const models: DiscoveredModel[] = [];
  let afterId: string | undefined;

  for (let page = 0; ; page++) {
    // A partial list would silently drop models, so a provider that never ends is an error.
    if (page === MAX_PAGES) throw new ProviderError('bad_response');

    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (afterId) query.set('after_id', afterId);

    const parsed = pageSchema.safeParse(
      await getJson(`${baseUrl}/models?${query.toString()}`, headers, options),
    );
    if (!parsed.success) throw new ProviderError('bad_response');

    for (const entry of parsed.data.data) {
      const contextWindow = positiveInt(entry.max_input_tokens);
      const maxOutput = positiveInt(entry.max_tokens);
      models.push({
        modelId: entry.id,
        displayName: entry.display_name?.trim() || entry.id,
        capabilities: capabilities({
          ...ANTHROPIC_DEFAULTS,
          ...(contextWindow ? { contextWindow } : {}),
          ...(maxOutput ? { maxOutput } : {}),
        }),
        enabled: true,
      });
    }

    if (!parsed.data.has_more || !parsed.data.last_id) break;
    afterId = parsed.data.last_id;
  }

  return models;
}

export const anthropicAdapter: ProviderAdapter = {
  type: 'anthropic',
  listModels,
  createModel(credential, modelId) {
    return createAnthropic({ apiKey: requireKey(credential), baseURL: resolveBaseUrl(credential) })(
      modelId,
    );
  },
};

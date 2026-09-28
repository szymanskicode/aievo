import { z } from 'zod';

import { capabilities, positiveInt } from '../capabilities.js';
import { ProviderError } from '../errors.js';
import { getJson, resolveBaseUrl } from '../http.js';
import type { DiscoveredModel, ProviderCredentialInput, RequestOptions } from '../types.js';

/**
 * `GET /models` in the OpenAI format. OpenAI itself returns only ids; some compatible
 * servers (e.g. OpenRouter) add a name, limits, modalities and supported parameters,
 * which are used when present. Everything else is left for manual editing.
 */
const listSchema = z.object({
  data: z.array(
    z.looseObject({
      id: z.string().min(1),
      name: z.string().optional(),
      context_length: z.unknown().optional(),
      architecture: z
        .looseObject({ input_modalities: z.array(z.string()).optional() })
        .optional()
        .catch(undefined),
      supported_parameters: z.array(z.string()).optional().catch(undefined),
      top_provider: z
        .looseObject({ max_completion_tokens: z.unknown().optional() })
        .nullable()
        .optional()
        .catch(undefined),
    }),
  ),
});

/**
 * Id prefixes of OpenAI models that cannot hold a chat. They are still saved, but
 * disabled, so nothing hides from the user. A heuristic; the user can enable them.
 */
const NON_CHAT_PREFIXES = [
  'text-embedding',
  'embedding',
  'whisper',
  'tts',
  'dall-e',
  'omni-moderation',
  'text-moderation',
];

function isChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  return !NON_CHAT_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export async function listOpenAiFormatModels(
  credential: ProviderCredentialInput,
  options?: RequestOptions,
): Promise<DiscoveredModel[]> {
  const headers: Record<string, string> = credential.apiKey
    ? { authorization: `Bearer ${credential.apiKey}` }
    : {};
  const parsed = listSchema.safeParse(
    await getJson(`${resolveBaseUrl(credential)}/models`, headers, options),
  );
  if (!parsed.success) throw new ProviderError('bad_response');

  const seen = new Set<string>();
  const models: DiscoveredModel[] = [];

  for (const entry of parsed.data.data) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);

    const params = entry.supported_parameters;
    const modalities = entry.architecture?.input_modalities;
    const contextWindow = positiveInt(entry.context_length);
    const maxOutput = positiveInt(entry.top_provider?.max_completion_tokens);

    models.push({
      modelId: entry.id,
      displayName: entry.name?.trim() || entry.id,
      capabilities: capabilities({
        ...(params?.includes('tools') ? { tools: true } : {}),
        ...(params?.includes('structured_outputs') ? { structuredOutput: true } : {}),
        ...(params?.includes('reasoning') ? { reasoning: true } : {}),
        ...(modalities?.includes('image') ? { vision: true } : {}),
        ...(contextWindow ? { contextWindow } : {}),
        ...(maxOutput ? { maxOutput } : {}),
      }),
      enabled: isChatModel(entry.id),
    });
  }

  return models.sort((a, b) => a.modelId.localeCompare(b.modelId));
}

import { z } from 'zod';

import { providerTypeSchema, providerTypes } from './enums.js';
import type { ProviderType } from './enums.js';

export type FieldRequirement = 'required' | 'optional';

export interface ProviderTypeInfo {
  type: ProviderType;
  displayName: string;
  apiKey: FieldRequirement;
  baseUrl: FieldRequirement;
  /** Used when `baseUrl` is left empty; `null` when the user must provide one. */
  defaultBaseUrl: string | null;
}

/**
 * Which fields each provider type needs. The single source for request validation,
 * `GET /provider-types` and the adapters in `@aievo/llm`.
 */
export const providerTypeInfo: Readonly<Record<ProviderType, ProviderTypeInfo>> = {
  anthropic: {
    type: 'anthropic',
    displayName: 'Anthropic',
    apiKey: 'required',
    baseUrl: 'optional',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
  },
  openai: {
    type: 'openai',
    displayName: 'OpenAI',
    apiKey: 'required',
    baseUrl: 'optional',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  'openai-compatible': {
    type: 'openai-compatible',
    displayName: 'OpenAI-compatible (Ollama, LM Studio, OpenRouter, vLLM…)',
    // Local servers such as Ollama accept requests without a key.
    apiKey: 'optional',
    baseUrl: 'required',
    defaultBaseUrl: null,
  },
};

export const providerTypeInfoList: readonly ProviderTypeInfo[] = providerTypes.map(
  (type) => providerTypeInfo[type],
);

/** Fields that a provider of `type` lacks, given which fields it will have after a write. */
export function missingProviderFields(
  type: ProviderType,
  present: { apiKey: boolean; baseUrl: boolean },
): ('apiKey' | 'baseUrl')[] {
  const info = providerTypeInfo[type];
  const missing: ('apiKey' | 'baseUrl')[] = [];
  if (info.apiKey === 'required' && !present.apiKey) missing.push('apiKey');
  if (info.baseUrl === 'required' && !present.baseUrl) missing.push('baseUrl');
  return missing;
}

const fieldRequirementSchema = z.enum(['required', 'optional']);

/** An entry of `GET /provider-types`. */
export const providerTypeInfoSchema = z
  .object({
    type: providerTypeSchema,
    displayName: z.string(),
    apiKey: fieldRequirementSchema,
    baseUrl: fieldRequirementSchema,
    defaultBaseUrl: z.string().nullable(),
  })
  .meta({ id: 'ProviderTypeInfo' });

const labelSchema = z.string().trim().min(1).max(200);
const apiKeySchema = z.string().trim().min(1).max(4096);
const baseUrlSchema = z.url({ protocol: /^https?$/ }).max(2048);

/** Body of `POST /providers`. Which fields are required depends on `type`. */
export const createProviderSchema = z
  .strictObject({
    type: providerTypeSchema,
    label: labelSchema,
    apiKey: apiKeySchema.optional(),
    baseUrl: baseUrlSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const missing = missingProviderFields(value.type, {
      apiKey: value.apiKey !== undefined,
      baseUrl: value.baseUrl != null,
    });
    for (const field of missing) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `Required for provider type ${value.type}`,
      });
    }
  })
  .meta({ id: 'CreateProvider' });

export type CreateProviderInput = z.infer<typeof createProviderSchema>;

/**
 * Body of `PATCH /providers/:id`. The type cannot change. `apiKey: null` removes the key,
 * which the API allows only for types where the key is optional.
 */
export const updateProviderSchema = z
  .strictObject({
    label: labelSchema.optional(),
    apiKey: apiKeySchema.nullable().optional(),
    baseUrl: baseUrlSchema.nullable().optional(),
  })
  .meta({ id: 'UpdateProvider' });

export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;

/** A provider as returned by the API. The key itself never leaves the server. */
export const providerSchema = z
  .object({
    id: z.uuid(),
    type: providerTypeSchema,
    label: z.string(),
    hasKey: z.boolean(),
    /** Last 4 characters of the key; `null` without a key or for very short keys. */
    keyHint: z.string().nullable(),
    baseUrl: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Provider' });

export type ProviderDto = z.infer<typeof providerSchema>;

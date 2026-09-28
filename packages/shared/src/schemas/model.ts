import { z } from 'zod';

import { outputSchema } from './output.js';

/** Shape of `model.capabilities` (JSONB). Unknown limits are `null`. */
export const modelCapabilitiesSchema = z.object({
  tools: z.boolean().default(false),
  vision: z.boolean().default(false),
  structuredOutput: z.boolean().default(false),
  promptCaching: z.boolean().default(false),
  reasoning: z.boolean().default(false),
  contextWindow: z.number().int().positive().nullable().default(null),
  maxOutput: z.number().int().positive().nullable().default(null),
});

export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;

/** Capabilities in `PATCH /models/:id`: only the provided ones change. */
export const modelCapabilitiesPatchSchema = z
  .strictObject({
    tools: z.boolean().optional(),
    vision: z.boolean().optional(),
    structuredOutput: z.boolean().optional(),
    promptCaching: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    contextWindow: z.number().int().positive().nullable().optional(),
    maxOutput: z.number().int().positive().nullable().optional(),
  })
  .meta({ id: 'ModelCapabilitiesPatch' });

export type ModelCapabilitiesPatch = z.infer<typeof modelCapabilitiesPatchSchema>;

// USD per million tokens; the column is numeric(12, 6).
const priceSchema = z.number().nonnegative().max(999_999);

/** Body of `PATCH /models/:id`. */
export const updateModelSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(200).optional(),
    capabilities: modelCapabilitiesPatchSchema.optional(),
    priceIn: priceSchema.nullable().optional(),
    priceOut: priceSchema.nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .meta({ id: 'UpdateModel' });

export type UpdateModelInput = z.infer<typeof updateModelSchema>;

/** Query of `GET /models`. */
export const modelListQuerySchema = z.strictObject({
  providerId: z.uuid().optional(),
});

export type ModelListQuery = z.infer<typeof modelListQuerySchema>;

/** A model as returned by the API. */
export const modelSchema = z
  .object({
    id: z.uuid(),
    providerId: z.uuid(),
    modelId: z.string(),
    displayName: z.string(),
    capabilities: outputSchema(modelCapabilitiesSchema).meta({ id: 'ModelCapabilities' }),
    priceIn: z.number().nullable(),
    priceOut: z.number().nullable(),
    enabled: z.boolean(),
  })
  .meta({ id: 'Model' });

export type ModelDto = z.infer<typeof modelSchema>;

/** Result of `POST /providers/:id/test`: the connection works and these models were found. */
export const providerTestResultSchema = z
  .object({
    /** Number of models the provider reported in this test. */
    discovered: z.number().int().nonnegative(),
    /** All models of the provider after saving the discovered ones. */
    models: z.array(modelSchema),
  })
  .meta({ id: 'ProviderTestResult' });

export type ProviderTestResult = z.infer<typeof providerTestResultSchema>;

import { z } from 'zod';

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

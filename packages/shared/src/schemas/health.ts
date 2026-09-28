import { z } from 'zod';

/**
 * Response of `GET /api/health`. Shared by the API route, its tests and (later)
 * the generated OpenAPI document, so the contract has a single source of truth.
 */
export const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
  })
  .meta({ id: 'HealthResponse' });

export type HealthResponse = z.infer<typeof healthResponseSchema>;

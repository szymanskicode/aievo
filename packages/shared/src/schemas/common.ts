import { z } from 'zod';

/** Path parameters of every `/:id` route. */
export const idParamsSchema = z.object({
  id: z.uuid(),
});

export type IdParams = z.infer<typeof idParamsSchema>;

/** Error payload shared by every API response: `{ error: { code, message, details? } }`. */
export const apiErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'ApiError' });

export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;

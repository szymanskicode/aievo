import { healthResponseSchema } from '@aievo/shared';
import { Router } from 'express';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json(healthResponseSchema.parse({ status: 'ok' }));
  });

  return router;
}

import express, { type ErrorRequestHandler, type Express } from 'express';
import { pinoHttp } from 'pino-http';

import { notFound, toApiError } from './errors.js';
import type { Logger } from './logger.js';
import { createHealthRouter } from './routes/health.js';

export interface CreateAppOptions {
  logger?: Logger;
}

/** All API routes live under `/api`. */
export const API_PREFIX = '/api';

export function createApp({ logger }: CreateAppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');

  if (logger) {
    app.use(pinoHttp({ logger }));
  }

  app.use(express.json());

  const api = express.Router();
  api.use(createHealthRouter());
  app.use(API_PREFIX, api);

  app.use((req, _res, next) => {
    // `req.path` drops the query string, which must not be echoed back.
    next(notFound(req.path));
  });

  const handleError: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const apiError = toApiError(error);

    if (apiError.status >= 500) {
      if (req.log) {
        req.log.error({ err: error }, 'Request failed');
      } else {
        // No logger was configured, but a server error must never pass silently.
        console.error('Request failed', error);
      }
    }

    res.status(apiError.status).json(apiError.toBody());
  };

  app.use(handleError);

  return app;
}

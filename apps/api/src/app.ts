import type { Db } from '@aievo/db';
import type { RunQueue } from '@aievo/queue';
import type { SecretBox } from '@aievo/shared/crypto';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { pinoHttp } from 'pino-http';

import { ApiError, notFound, toApiError } from './errors.js';
import { mountRoutes } from './http/route.js';
import { defaultWorkspaceResolver } from './http/workspace.js';
import type { WorkspaceResolver } from './http/workspace.js';
import type { Logger } from './logger.js';
import { API_PREFIX, apiRoutes } from './routes.js';

export interface CreateAppOptions {
  db: Db;
  logger?: Logger;
  /** Encrypts and decrypts provider keys (`AIEVO_MASTER_KEY`). */
  secretBox: SecretBox;
  /** Hands runs over to the worker. Without it, starting a run answers 503. */
  queue?: RunQueue;
  /** Defaults to the seeded workspace; tests bind the app to a workspace of their own. */
  resolveWorkspace?: WorkspaceResolver;
}

export { API_PREFIX };

const noQueue: RunQueue = {
  enqueueRun() {
    return Promise.reject(
      new ApiError(503, 'queue_unavailable', 'The run queue is not available in this process'),
    );
  },
};

export function createApp({
  db,
  logger,
  secretBox,
  queue = noQueue,
  resolveWorkspace = defaultWorkspaceResolver,
}: CreateAppOptions): Express {
  const app = express();

  app.disable('x-powered-by');

  if (logger) {
    app.use(pinoHttp({ logger }));
  }

  app.use(express.json());

  const api = express.Router();
  mountRoutes(api, apiRoutes, { db, secretBox, queue, resolveWorkspace });
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

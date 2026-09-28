import { createDb } from '@aievo/db';

import { createApp } from './app.js';
import { API_HOST, loadEnv } from './env.js';
import { createLogger } from './logger.js';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const { db, close } = createDb(env.DATABASE_URL);
const app = createApp({ db, logger });

const server = app.listen(env.API_PORT, API_HOST, () => {
  logger.info({ host: API_HOST, port: env.API_PORT }, 'AIEvo API listening');
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    void close().finally(() => process.exit(0));
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

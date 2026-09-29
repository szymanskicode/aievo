import { createDb } from '@aievo/db';
import { createRunQueue } from '@aievo/queue';
import { createSecretBox } from '@aievo/shared/crypto';

import { createApp } from './app.js';
import { API_HOST, loadEnv, loadMasterKey } from './env.js';
import { createLogger } from './logger.js';

const env = loadEnv();
// Fails fast with a readable message before anything listens.
const secretBox = createSecretBox(loadMasterKey());
const logger = createLogger(env.LOG_LEVEL);
const { db, close } = createDb(env.DATABASE_URL);
const queue = await createRunQueue({
  connectionString: env.DATABASE_URL,
  role: 'api',
  onError: (error) => logger.error({ err: error }, 'Run queue error'),
});
const app = createApp({ db, logger, secretBox, queue });

const server = app.listen(env.API_PORT, API_HOST, () => {
  logger.info({ host: API_HOST, port: env.API_PORT }, 'AIEvo API listening');
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    void queue
      .stop()
      .then(close)
      .finally(() => process.exit(0));
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

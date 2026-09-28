import { createApp } from './app.js';
import { API_HOST, loadEnv } from './env.js';
import { createLogger } from './logger.js';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const app = createApp({ logger });

app.listen(env.API_PORT, API_HOST, () => {
  logger.info({ host: API_HOST, port: env.API_PORT }, 'AIEvo API listening');
});

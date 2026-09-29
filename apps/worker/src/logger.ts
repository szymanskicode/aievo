import { pino, type DestinationStream, type Logger } from 'pino';

import type { WorkerEnv } from './env.js';

/**
 * Values that must never reach the logs, wherever an object carrying them might be logged by
 * mistake. Same list as the API's logger.
 */
const SECRET_FIELDS = ['apiKey', 'encryptedKey', 'token', 'encryptedToken'];

const REDACTED_PATHS = SECRET_FIELDS.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]);

/** `destination` lets tests capture output; production logs to stdout. */
export function createLogger(
  level: WorkerEnv['LOG_LEVEL'],
  destination?: DestinationStream,
): Logger {
  const options = {
    level,
    name: 'worker',
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  };

  return destination ? pino(options, destination) : pino(options);
}

export type { Logger };

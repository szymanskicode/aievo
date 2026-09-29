import { pino, type DestinationStream, type Logger } from 'pino';

import type { Env } from './env.js';

/**
 * Values that must never reach the logs. pino-http logs the whole header object, so
 * redaction is configured on the logger itself rather than per call. Provider keys and Git
 * tokens are also covered wherever an object carrying them might be logged by mistake.
 */
const SECRET_FIELDS = ['apiKey', 'encryptedKey', 'token', 'encryptedToken'];

const REDACTED_PATHS = [
  ...SECRET_FIELDS.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'res.headers["set-cookie"]',
];

/** `destination` lets tests capture output; production logs to stdout. */
export function createLogger(level: Env['LOG_LEVEL'], destination?: DestinationStream): Logger {
  const options = {
    level,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  };

  return destination ? pino(options, destination) : pino(options);
}

export type { Logger };

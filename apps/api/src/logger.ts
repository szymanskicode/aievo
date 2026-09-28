import { pino, type DestinationStream, type Logger } from 'pino';

import type { Env } from './env.js';

/**
 * Values that must never reach the logs. pino-http logs the whole header object, so
 * redaction is configured on the logger itself rather than per call. Provider keys are
 * also covered wherever an object carrying them might be logged by mistake.
 */
const REDACTED_PATHS = [
  'apiKey',
  'encryptedKey',
  '*.apiKey',
  '*.encryptedKey',
  '*.*.apiKey',
  '*.*.encryptedKey',
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

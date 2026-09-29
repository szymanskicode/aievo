import { describe, expect, it } from 'vitest';

import { createLogger } from './logger.js';

function capture() {
  const written: string[] = [];
  const logger = createLogger('info', {
    write: (chunk: string) => {
      written.push(chunk);
    },
  });
  return { logger, output: () => written.join('') };
}

describe('createLogger', () => {
  it('redacts provider keys wherever they appear in a logged object', () => {
    const { logger, output } = capture();

    logger.info({ apiKey: 'sk-top-level', encryptedKey: 'v1:top:level:x' }, 'top');
    logger.info({ body: { apiKey: 'sk-nested' } }, 'nested');
    logger.info({ req: { body: { apiKey: 'sk-deep', encryptedKey: 'v1:deep:x:y' } } }, 'deep');

    const logs = output();
    for (const secret of [
      'sk-top-level',
      'v1:top:level:x',
      'sk-nested',
      'sk-deep',
      'v1:deep:x:y',
    ]) {
      expect(logs).not.toContain(secret);
    }
    expect(logs.match(/\[redacted\]/g)).toHaveLength(5);
  });

  it('redacts Git tokens wherever they appear in a logged object', () => {
    const { logger, output } = capture();

    logger.info({ token: 'github_pat_top', encryptedToken: 'v1:tok:en:x' }, 'top');
    logger.info({ body: { token: 'github_pat_nested' } }, 'nested');
    logger.info({ req: { body: { token: 'ghp_deep', encryptedToken: 'v1:deep:tok:y' } } }, 'deep');

    const logs = output();
    for (const secret of [
      'github_pat_top',
      'v1:tok:en:x',
      'github_pat_nested',
      'ghp_deep',
      'v1:deep:tok:y',
    ]) {
      expect(logs).not.toContain(secret);
    }
    expect(logs.match(/\[redacted\]/g)).toHaveLength(5);
  });
});

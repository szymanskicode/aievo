import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loadEnv, loadMasterKey } from './env.js';

describe('loadEnv', () => {
  it('falls back to port 3001', () => {
    expect(loadEnv({}).API_PORT).toBe(3001);
  });

  it('reads API_PORT from the environment', () => {
    expect(loadEnv({ API_PORT: '4000' }).API_PORT).toBe(4000);
  });

  it('rejects a port that is not a number', () => {
    expect(() => loadEnv({ API_PORT: 'not-a-port' })).toThrow(/API_PORT/);
  });
});

describe('loadMasterKey', () => {
  it('returns the decoded 32-byte key', () => {
    const key = randomBytes(32);
    expect(loadMasterKey({ AIEVO_MASTER_KEY: key.toString('base64') }).equals(key)).toBe(true);
  });

  it('fails with a readable message when the key is missing', () => {
    expect(() => loadMasterKey({})).toThrow(/AIEVO_MASTER_KEY is not set/);
  });

  it('fails with a readable message when the key has the wrong length', () => {
    const value = randomBytes(16).toString('base64');
    expect(() => loadMasterKey({ AIEVO_MASTER_KEY: value })).toThrow(/16 bytes instead of 32/);
    expect(() => loadMasterKey({ AIEVO_MASTER_KEY: value })).not.toThrow(value);
  });
});

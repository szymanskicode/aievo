import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';

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

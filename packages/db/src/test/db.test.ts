import { afterEach, describe, expect, it, vi } from 'vitest';

import { testDatabaseUrl } from './db.js';

describe('testDatabaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a database whose name ends in _test', () => {
    vi.stubEnv('DATABASE_URL_TEST', 'postgresql://u:p@127.0.0.1:5432/other_test');
    expect(testDatabaseUrl()).toBe('postgresql://u:p@127.0.0.1:5432/other_test');
  });

  it('refuses the development database', () => {
    vi.stubEnv('DATABASE_URL_TEST', 'postgresql://u:p@127.0.0.1:5432/aievo');
    expect(() => testDatabaseUrl()).toThrow(/must end in _test/);
  });
});

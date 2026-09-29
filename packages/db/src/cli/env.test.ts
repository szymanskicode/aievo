import { describe, expect, it } from 'vitest';

import { requireDatabaseUrl } from './env.js';

describe('requireDatabaseUrl', () => {
  it('returns DATABASE_URL', () => {
    const url = 'postgresql://aievo:aievo@127.0.0.1:5432/aievo';
    expect(requireDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it.each([{}, { DATABASE_URL: '' }])('explains how to configure a missing URL (%o)', (env) => {
    expect(() => requireDatabaseUrl(env)).toThrow(/DATABASE_URL is not set.*\.env\.example/);
  });
});

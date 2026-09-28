import { describe, expect, it } from 'vitest';

import { apiErrorSchema, idParamsSchema } from './common.js';

describe('idParamsSchema', () => {
  it('accepts a UUID', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(idParamsSchema.parse({ id })).toEqual({ id });
  });

  it('rejects anything else', () => {
    expect(idParamsSchema.safeParse({ id: '42' }).success).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it('accepts an error with and without details', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'x', message: 'y' } }).success).toBe(true);
    expect(
      apiErrorSchema.safeParse({ error: { code: 'x', message: 'y', details: [1] } }).success,
    ).toBe(true);
  });

  it('requires a code and a message', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'x' } }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { outputSchema } from './output.js';
import { testPolicySchema } from './project.js';

const source = z.object({
  name: z.string().default('x'),
  limit: z.number().nullable().default(null),
  note: z.string().optional(),
  nested: z.object({ flag: z.boolean().default(false) }).prefault({}),
  tags: z.array(z.object({ id: z.string().default('a') })).default([]),
});

describe('outputSchema', () => {
  it('accepts everything the source schema produces', () => {
    const output = outputSchema(source);

    expect(output.parse(source.parse({}))).toEqual(source.parse({}));
    expect(outputSchema(testPolicySchema).safeParse(testPolicySchema.parse({})).success).toBe(true);
  });

  it('requires fields that had a default, at every level', () => {
    const output = outputSchema(source);
    const full = source.parse({ tags: [{}] });

    expect(output.safeParse({ ...full, name: undefined }).success).toBe(false);
    expect(output.safeParse({ ...full, nested: {} }).success).toBe(false);
    expect(output.safeParse({ ...full, tags: [{}] }).success).toBe(false);
  });

  it('keeps optional and nullable fields as they were', () => {
    const output = outputSchema(source);
    const full = source.parse({});

    expect(output.safeParse({ ...full, limit: null }).success).toBe(true);
    expect(output.safeParse({ ...full, note: undefined }).success).toBe(true);
  });

  it('leaves the source schema untouched', () => {
    outputSchema(source);

    expect(source.parse({})).toMatchObject({ name: 'x', nested: { flag: false } });
  });
});

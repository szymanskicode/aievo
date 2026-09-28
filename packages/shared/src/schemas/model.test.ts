import { describe, expect, it } from 'vitest';

import {
  modelCapabilitiesPatchSchema,
  modelCapabilitiesSchema,
  modelListQuerySchema,
  updateModelSchema,
} from './model.js';

describe('modelCapabilitiesSchema', () => {
  it('defaults every capability to off and limits to unknown', () => {
    expect(modelCapabilitiesSchema.parse({})).toEqual({
      tools: false,
      vision: false,
      structuredOutput: false,
      promptCaching: false,
      reasoning: false,
      contextWindow: null,
      maxOutput: null,
    });
  });

  it('keeps provided values', () => {
    const parsed = modelCapabilitiesSchema.parse({ tools: true, contextWindow: 200_000 });
    expect(parsed.tools).toBe(true);
    expect(parsed.contextWindow).toBe(200_000);
  });

  it('rejects a non-integer context window', () => {
    expect(modelCapabilitiesSchema.safeParse({ contextWindow: 1.5 }).success).toBe(false);
  });
});

describe('updateModelSchema', () => {
  it('accepts a partial capabilities patch and prices', () => {
    expect(
      updateModelSchema.parse({ capabilities: { vision: true }, priceIn: 3, priceOut: null }),
    ).toEqual({ capabilities: { vision: true }, priceIn: 3, priceOut: null });
  });

  it('rejects unknown capabilities, negative prices and an empty name', () => {
    expect(updateModelSchema.safeParse({ capabilities: { telepathy: true } }).success).toBe(false);
    expect(updateModelSchema.safeParse({ priceIn: -1 }).success).toBe(false);
    expect(updateModelSchema.safeParse({ displayName: ' ' }).success).toBe(false);
  });

  it('does not fill in capability defaults', () => {
    expect(modelCapabilitiesPatchSchema.parse({})).toEqual({});
  });
});

describe('modelListQuerySchema', () => {
  it('accepts an optional provider id', () => {
    expect(modelListQuerySchema.parse({})).toEqual({});
    expect(modelListQuerySchema.safeParse({ providerId: 'nope' }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { modelCapabilitiesSchema } from './model.js';

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

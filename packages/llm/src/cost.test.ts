import { describe, expect, it } from 'vitest';

import { computeCostUsd } from './cost.js';

const pricing = { inputUsdPerMTok: 3, outputUsdPerMTok: 15 };

describe('computeCostUsd', () => {
  it('prices input and output tokens per million', () => {
    expect(computeCostUsd({ inputTokens: 2_000_000, outputTokens: 100_000 }, pricing)).toBe(7.5);
  });

  it('counts unknown token numbers as zero', () => {
    expect(computeCostUsd({ inputTokens: null, outputTokens: 1_000_000 }, pricing)).toBe(15);
    expect(computeCostUsd({ inputTokens: null, outputTokens: null }, pricing)).toBe(0);
  });

  it('is zero for a free model', () => {
    const free = { inputUsdPerMTok: 0, outputUsdPerMTok: 0 };
    expect(computeCostUsd({ inputTokens: 5000, outputTokens: 5000 }, free)).toBe(0);
  });
});

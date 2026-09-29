import { describe, expect, it } from 'vitest';

import { describeKey, formatTokens } from './format';

describe('formatTokens', () => {
  it('shortens token counts', () => {
    expect(formatTokens(512)).toBe('512');
    expect(formatTokens(200_000)).toBe('200k');
    expect(formatTokens(1_000_000)).toBe('1M');
    expect(formatTokens(1_048_576)).toBe('1M');
    expect(formatTokens(1_500_000)).toBe('1.5M');
  });
});

describe('describeKey', () => {
  it('shows only the key hint', () => {
    expect(describeKey({ hasKey: true, keyHint: 'abcd' })).toBe('Key ••••abcd');
    expect(describeKey({ hasKey: true, keyHint: null })).toBe('Key saved');
    expect(describeKey({ hasKey: false, keyHint: null })).toBe('No key');
  });
});

import { describe, expect, it } from 'vitest';

import { TOOL_RESULT_MAX_CHARS, truncateToolResult } from './run.js';

describe('truncateToolResult', () => {
  it('returns short text unchanged', () => {
    expect(truncateToolResult('ok')).toBe('ok');
    const exact = 'x'.repeat(TOOL_RESULT_MAX_CHARS);
    expect(truncateToolResult(exact)).toBe(exact);
  });

  it('keeps the head and the tail within the limit', () => {
    const text = `HEAD${'-'.repeat(50_000)}TAIL`;

    const result = truncateToolResult(text);

    expect(result.length).toBeLessThanOrEqual(TOOL_RESULT_MAX_CHARS);
    expect(result.startsWith('HEAD')).toBe(true);
    expect(result.endsWith('TAIL')).toBe(true);
  });

  it('reports how many characters were cut out', () => {
    const text = 'a'.repeat(100) + 'b'.repeat(100);

    const result = truncateToolResult(text, 80);

    const omitted = Number(/\[… (\d+) characters omitted …\]/.exec(result)?.[1]);
    const kept = result.replace(/\n\[… \d+ characters omitted …\]\n/, '');
    expect(kept.length + omitted).toBe(text.length);
    expect(result.length).toBeLessThanOrEqual(80);
  });

  it('cuts plainly when the limit is smaller than the marker', () => {
    expect(truncateToolResult('abcdefghij', 4)).toBe('abcd');
  });
});

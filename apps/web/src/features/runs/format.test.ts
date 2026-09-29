import { describe, expect, it } from 'vitest';

import { elapsedMs, formatArgs, formatCost, formatDuration, formatTokens } from './format';

describe('formatCost', () => {
  it('keeps four digits below a dollar and two above', () => {
    expect(formatCost(0.01234)).toBe('$0.0123');
    expect(formatCost(0)).toBe('$0.0000');
    expect(formatCost(12.5)).toBe('$12.50');
  });
});

describe('formatTokens', () => {
  it('groups thousands', () => {
    expect(formatTokens(1_234_567)).toBe('1,234,567');
  });
});

describe('formatDuration', () => {
  it('picks a readable unit', () => {
    expect(formatDuration(850)).toBe('850 ms');
    expect(formatDuration(12_300)).toBe('12 s');
    expect(formatDuration(185_000)).toBe('3 min 5 s');
    expect(formatDuration(120_000)).toBe('2 min');
    expect(formatDuration(3_720_000)).toBe('1 h 2 min');
    expect(formatDuration(7_200_000)).toBe('2 h');
  });
});

describe('elapsedMs', () => {
  it('measures until the end, or until now while running', () => {
    const start = '2026-09-29T10:00:00.000Z';
    expect(elapsedMs(start, '2026-09-29T10:00:30.000Z')).toBe(30_000);
    expect(elapsedMs(start, null, Date.parse('2026-09-29T10:01:00.000Z'))).toBe(60_000);
    expect(elapsedMs(null, null)).toBeNull();
  });
});

describe('formatArgs', () => {
  it('lists arguments on one line and shortens long values', () => {
    expect(formatArgs({ path: 'src/a.ts', line: 3 })).toBe('path: src/a.ts, line: 3');
    const long = formatArgs({ content: `a\n${'x'.repeat(100)}` });
    expect(long).toMatch(/^content: a x+…$/);
    expect(long.length).toBe('content: '.length + 60);
  });

  it('keeps the whole line within its limit', () => {
    const args = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`key${index}`, 'y'.repeat(30)]),
    );
    expect(formatArgs(args)).toHaveLength(120);
  });
});

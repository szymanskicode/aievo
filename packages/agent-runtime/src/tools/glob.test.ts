import { describe, expect, it } from 'vitest';

import { matchesPath } from './glob.js';

describe('matchesPath', () => {
  it.each([
    ['.github/workflows/ci.yml', '**'],
    ['src/.env', '**'],
    ['.gitignore', '*'],
    ['.env', '*.env'],
    ['.github/workflows/ci.yml', '.github/**'],
    ['.github/.hidden/x', '.github/**'],
    ['.config/a.test.ts', '**/*.test.ts'],
    ['a/b.test.ts', '**/*.test.ts'],
    ['b.test.ts', '**/*.test.ts'],
    ['src/a.ts', 'src/**'],
  ])('matches %j with %j, dotfiles included', (file, glob) => {
    expect(matchesPath(file, glob)).toBe(true);
  });

  it.each([
    ['src/a.ts', '**/*.test.ts'],
    ['lib/a.ts', 'src/**'],
    ['.github/ci.yml', 'src/**'],
    ['.github/ci.yml', '.gitlab/**'],
    ['src/.env', 'src/*.ts'],
  ])('does not match %j with %j', (file, glob) => {
    expect(matchesPath(file, glob)).toBe(false);
  });
});

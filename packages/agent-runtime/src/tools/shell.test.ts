import { describe, expect, it } from 'vitest';

import { isAllowedCommand, shellQuote } from './shell.js';

describe('shellQuote', () => {
  it('quotes a value as one word', () => {
    expect(shellQuote('plain')).toBe("'plain'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote('$(rm -rf /)')).toBe("'$(rm -rf /)'");
  });
});

describe('isAllowedCommand', () => {
  const allowed = ['npm test', 'pnpm run lint', '  '];

  it('accepts exact commands and plain arguments', () => {
    expect(isAllowedCommand('npm test', allowed)).toBe(true);
    expect(isAllowedCommand('  npm test  ', allowed)).toBe(true);
    expect(isAllowedCommand('npm test -- --run src/a.test.ts', allowed)).toBe(true);
    expect(isAllowedCommand('pnpm run lint --fix', allowed)).toBe(true);
    expect(isAllowedCommand('npm test -- -t=sum,add @scope/pkg a+b 50%', allowed)).toBe(true);
  });

  it('refuses other commands, prefixes without a space and shell syntax', () => {
    expect(isAllowedCommand('npm testing', allowed)).toBe(false);
    expect(isAllowedCommand('npm', allowed)).toBe(false);
    expect(isAllowedCommand('', allowed)).toBe(false);
    expect(isAllowedCommand('npm test; ls', allowed)).toBe(false);
    expect(isAllowedCommand('npm test "x"', allowed)).toBe(false);
    expect(isAllowedCommand('npm test\tx', allowed)).toBe(false);
    expect(isAllowedCommand('npm test ~/x', allowed)).toBe(false);
    expect(isAllowedCommand('npm test *', allowed)).toBe(false);
  });
});

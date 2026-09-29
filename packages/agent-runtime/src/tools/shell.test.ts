import { describe, expect, it } from 'vitest';

import { describeAllowedCommands, isAllowedCommand, shellQuote } from './shell.js';

describe('shellQuote', () => {
  it('quotes a value as one word', () => {
    expect(shellQuote('plain')).toBe("'plain'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote('$(rm -rf /)')).toBe("'$(rm -rf /)'");
  });
});

describe('isAllowedCommand', () => {
  const allowed = [
    { command: 'npm test', allowArgs: true },
    { command: 'pnpm run lint', allowArgs: true },
    { command: 'npm install', allowArgs: false },
    { command: '  ', allowArgs: true },
  ];

  it('accepts exact commands and plain arguments where allowed', () => {
    expect(isAllowedCommand('npm test', allowed)).toBe(true);
    expect(isAllowedCommand('  npm test  ', allowed)).toBe(true);
    expect(isAllowedCommand('npm test -- --run src/a.test.ts', allowed)).toBe(true);
    expect(isAllowedCommand('pnpm run lint --fix', allowed)).toBe(true);
    expect(isAllowedCommand('npm test -- -t=sum,add @scope/pkg a+b 50%', allowed)).toBe(true);
    expect(isAllowedCommand('npm install', allowed)).toBe(true);
  });

  it('refuses arguments for commands without allowArgs', () => {
    expect(isAllowedCommand('npm install left-pad', allowed)).toBe(false);
    expect(isAllowedCommand('npm install --save-dev vitest', allowed)).toBe(false);
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

describe('describeAllowedCommands', () => {
  it('lists the commands and where arguments are allowed', () => {
    expect(
      describeAllowedCommands([
        { command: 'npm install', allowArgs: false },
        { command: 'npm test', allowArgs: true },
      ]),
    ).toBe('- npm install\n- npm test (plain arguments allowed)');
    expect(describeAllowedCommands([])).toBe('(none)');
  });
});

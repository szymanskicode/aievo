import type { AllowedCommand } from '../types.js';

/** Quotes `value` as one POSIX shell word. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Arguments that may follow an allowed command: plain words, no shell syntax at all. */
const SAFE_ARGUMENTS = /^[A-Za-z0-9_./=:@%+, -]+$/;

/**
 * Whether `command` is one of `allowed`, or, for entries with `allowArgs`, one of them followed
 * by plain arguments (e.g. `npm test -- src/math.test.ts`). Anything with quotes, `;`, `|`,
 * `$`, redirections or newlines is refused, so an allowed prefix cannot smuggle in another
 * command.
 */
export function isAllowedCommand(command: string, allowed: readonly AllowedCommand[]): boolean {
  const trimmed = command.trim();
  return allowed.some((entry) => {
    const base = entry.command.trim();
    if (base === '') return false;
    if (trimmed === base) return true;
    return (
      entry.allowArgs &&
      trimmed.startsWith(`${base} `) &&
      SAFE_ARGUMENTS.test(trimmed.slice(base.length + 1))
    );
  });
}

/** The allowed commands as a list for the model. */
export function describeAllowedCommands(allowed: readonly AllowedCommand[]): string {
  if (allowed.length === 0) return '(none)';
  return allowed
    .map((entry) => `- ${entry.command}${entry.allowArgs ? ' (plain arguments allowed)' : ''}`)
    .join('\n');
}

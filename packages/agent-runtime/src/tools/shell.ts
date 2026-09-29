/** Quotes `value` as one POSIX shell word. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Arguments that may follow an allowed command: plain words, no shell syntax at all. */
const SAFE_ARGUMENTS = /^[A-Za-z0-9_./=:@%+, -]+$/;

/**
 * Whether `command` is one of `allowed`, or one of them followed by plain arguments
 * (e.g. `npm test -- src/math.test.ts`). Anything with quotes, `;`, `|`, `$`, redirections
 * or newlines is refused, so an allowed prefix cannot smuggle in another command.
 */
export function isAllowedCommand(command: string, allowed: readonly string[]): boolean {
  const trimmed = command.trim();
  return allowed.some((entry) => {
    const base = entry.trim();
    if (base === '') return false;
    if (trimmed === base) return true;
    return trimmed.startsWith(`${base} `) && SAFE_ARGUMENTS.test(trimmed.slice(base.length + 1));
  });
}

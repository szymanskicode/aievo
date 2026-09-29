/** Any value that survives a JSON round trip; the type of the JSONB columns of runs. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Longest tool result stored in `tool_call.result`. Command output can be megabytes;
 * the start and the end of it are what an agent and a human need.
 */
export const TOOL_RESULT_MAX_CHARS = 16_000;

/**
 * Shortens `text` to at most `max` characters, keeping its head and tail and marking
 * how much was cut out of the middle.
 */
export function truncateToolResult(text: string, max = TOOL_RESULT_MAX_CHARS): string {
  if (text.length <= max) return text;

  // The marker length depends on the number it contains, so it is sized for the worst case.
  const marker = (omitted: number) => `\n[… ${omitted} characters omitted …]\n`;
  const budget = max - marker(text.length).length;
  // A limit too small for the marker gets a plain cut.
  if (budget <= 0) return text.slice(0, max);
  const head = Math.ceil(budget / 2);
  const tail = budget - head;
  const omitted = text.length - head - tail;

  return text.slice(0, head) + marker(omitted) + text.slice(text.length - tail);
}

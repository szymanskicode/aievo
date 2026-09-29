/** A cost in USD; small amounts keep enough digits to tell runs apart. */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`;
}

export function formatTokens(count: number): string {
  return new Intl.NumberFormat('en-US').format(count);
}

/** `850 ms`, `12 s`, `3 min 5 s`, `1 h 2 min`. */
export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.max(0, Math.round(ms))} ms`;
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return seconds % 60 === 0 ? `${minutes} min` : `${minutes} min ${seconds % 60} s`;
  }
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

/** How long something ran: until it ended, or until `now` while it still runs. */
export function elapsedMs(
  startedAt: string | null,
  endedAt: string | null,
  now: number = Date.now(),
): number | null {
  if (!startedAt) return null;
  return (endedAt ? Date.parse(endedAt) : now) - Date.parse(startedAt);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

const ARG_VALUE_MAX = 60;
const ARGS_MAX = 120;

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Arguments of a tool call on one line, e.g. `path: src/a.ts, content: export…`. */
export function formatArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args).map(([key, value]) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return `${key}: ${shorten(text.replace(/\s+/g, ' '), ARG_VALUE_MAX)}`;
  });
  return shorten(parts.join(', '), ARGS_MAX);
}

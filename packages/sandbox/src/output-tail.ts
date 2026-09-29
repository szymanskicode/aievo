/** Longest line kept; minified bundles and progress bars can print megabytes in one line. */
const MAX_LINE_CHARS = 2_000;

/**
 * Keeps the last `maxLines` lines of a stream of text chunks, so a command printing gigabytes
 * never holds more than a small, fixed amount of memory.
 */
export class OutputTail {
  private readonly lines: string[] = [];
  private partial = '';
  private dropped = false;
  private readonly decoder = new TextDecoder();

  constructor(private readonly maxLines: number) {}

  push(chunk: Uint8Array): void {
    const text = this.partial + this.decoder.decode(chunk, { stream: true });
    const parts = text.split('\n');
    this.partial = clip(parts.pop() ?? '');
    for (const line of parts) this.addLine(line);
  }

  /** Whether lines were dropped from the start. */
  get truncated(): boolean {
    return this.dropped;
  }

  toString(): string {
    const rest = this.partial + this.decoder.decode();
    const lines = rest === '' ? this.lines : [...this.lines, rest];
    const kept = lines.slice(-this.maxLines);
    return kept.map((line) => line.replace(/\r$/, '')).join('\n');
  }

  private addLine(line: string): void {
    this.lines.push(clip(line));
    if (this.lines.length > this.maxLines) {
      this.lines.shift();
      this.dropped = true;
    }
  }
}

function clip(line: string): string {
  return line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)} [… line cut]` : line;
}

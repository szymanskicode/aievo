import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SandboxError, WORKSPACE_DIR, resolveWorkspacePath } from '@aievo/sandbox';
import type {
  ExecOptions,
  ExecResult,
  ListFilesOptions,
  ReadFileOptions,
  Sandbox,
} from '@aievo/sandbox';

export type ExecHandler = (
  command: string,
  options: ExecOptions,
) => ExecResult | Promise<ExecResult>;

/** Where a path that resolves outside the directory is reported, like a path of the container. */
const OUTSIDE = '/outside-workspace';

/**
 * A `Sandbox` on a local directory, for tests only: files are real, commands are answered by
 * `exec` (no shell runs, so tests behave the same on every OS). `/workspace` maps to `root`.
 */
export class TempDirSandbox implements Sandbox {
  readonly runId = 'test-run';
  readonly commands: { command: string; options: ExecOptions }[] = [];

  constructor(
    readonly root: string,
    private readonly handler?: ExecHandler,
  ) {}

  /** Host path of a `/workspace` path. */
  hostPath(input: string): string {
    const relative = path.posix.relative(WORKSPACE_DIR, resolveWorkspacePath(input));
    return path.join(this.root, ...relative.split('/').filter(Boolean));
  }

  async exec(command: string, options: ExecOptions): Promise<ExecResult> {
    this.commands.push({ command, options });
    if (!this.handler) throw new Error('TempDirSandbox: no exec handler');
    return this.handler(command, options);
  }

  async readFile(input: string, options: ReadFileOptions = {}): Promise<string> {
    const file = this.hostPath(input);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) throw new SandboxError('file_not_found');
    if (options.maxBytes !== undefined && info.size > options.maxBytes) {
      throw new SandboxError('file_too_large');
    }
    return readFile(file, 'utf8');
  }

  async writeFile(input: string, content: string): Promise<void> {
    const file = this.hostPath(input);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, 'utf8');
  }

  async realPath(input: string): Promise<string> {
    const root = await realpath(this.root);
    // Resolve the longest existing part; the missing rest is kept as it is (`realpath -m`).
    let existing = this.hostPath(input);
    const missing: string[] = [];
    for (;;) {
      try {
        existing = await realpath(existing);
        break;
      } catch {
        missing.unshift(path.basename(existing));
        existing = path.dirname(existing);
      }
    }
    const resolved = path.join(existing, ...missing);
    const relative = path.relative(root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return `${OUTSIDE}/${resolved.replace(/\\/g, '/')}`;
    }
    return relative === ''
      ? WORKSPACE_DIR
      : `${WORKSPACE_DIR}/${relative.split(path.sep).join('/')}`;
  }

  async listFiles(dir = '.', options: ListFilesOptions = {}): Promise<string[]> {
    const base = this.hostPath(dir);
    const entries = await readdir(base, { recursive: true, withFileTypes: true }).catch(() => {
      throw new SandboxError('command_failed', { detail: 'no such directory' });
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(this.root, path.join(entry.parentPath, entry.name)))
      .map((file) => file.split(path.sep).join('/'))
      .filter((file) => !file.split('/').includes('.git'))
      .sort()
      .slice(0, options.limit ?? 5000);
  }

  async stop(): Promise<void> {}

  async cleanup(): Promise<void> {
    await rm(this.root, { recursive: true, force: true, maxRetries: 5 });
  }
}

export async function createTempDirSandbox(handler?: ExecHandler): Promise<TempDirSandbox> {
  const root = await mkdtemp(path.join(tmpdir(), 'aievo-agent-'));
  return new TempDirSandbox(root, handler);
}

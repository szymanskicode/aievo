import Docker from 'dockerode';
import type { Container } from 'dockerode';

import { RUN_LABEL, buildContainerOptions } from './container-spec.js';
import { createDemuxer } from './demux.js';
import { SandboxError } from './errors.js';
import { OutputTail } from './output-tail.js';
import { resolveWorkspacePath, toWorkspaceRelative } from './paths.js';
import type {
  CreateSandboxInput,
  ExecOptions,
  ExecResult,
  ListFilesOptions,
  ReadFileOptions,
  Sandbox,
  SandboxFactory,
} from './sandbox.js';

const DEFAULT_TAIL_LINES = 200;
const DEFAULT_READ_LIMIT = 1024 * 1024;
const DEFAULT_LIST_LIMIT = 5_000;
/** Limit of the small helper commands behind `readFile`, `writeFile` and `listFiles`. */
const FILE_OP_TIMEOUT_MS = 60_000;
/** Base64 characters per exec when writing a file; one argument may hold at most 128 KiB. */
const WRITE_CHUNK_CHARS = 96 * 1024;
/** How long past its timeout a command may take before the client stops waiting. */
const TIMEOUT_GRACE_MS = 5_000;
/** Exit status of coreutils `timeout` after it had to send SIGKILL. */
const KILLED_BY_TIMEOUT = 137;

export interface DockerSandboxOptions {
  docker?: Docker;
  image: string;
  /** `uid:gid` from `resolveSandboxUser`. */
  user: string;
}

interface RawResult {
  exitCode: number | null;
  stdout: Buffer;
  stderr: Buffer;
}

function statusOf(error: unknown): number | undefined {
  const { statusCode } = error as { statusCode?: unknown };
  return typeof statusCode === 'number' ? statusCode : undefined;
}

function isUnreachable(error: unknown): boolean {
  const { code } = error as { code?: unknown };
  return code === 'ENOENT' || code === 'ECONNREFUSED' || code === 'EPIPE';
}

export function createDockerSandboxFactory(options: DockerSandboxOptions): SandboxFactory {
  const docker = options.docker ?? new Docker();

  return {
    async create(input: CreateSandboxInput): Promise<Sandbox> {
      let container: Container;
      try {
        container = await docker.createContainer(
          buildContainerOptions({ ...input, image: options.image, user: options.user }),
        );
      } catch (error) {
        if (isUnreachable(error)) throw new SandboxError('docker_unavailable', { cause: error });
        if (statusOf(error) === 404) throw new SandboxError('image_missing', { cause: error });
        throw new SandboxError('start_failed', { cause: error });
      }
      try {
        await container.start();
      } catch (error) {
        await container.remove({ force: true }).catch(() => undefined);
        throw new SandboxError('start_failed', { cause: error });
      }
      return new DockerSandbox(input.runId, container);
    },
  };
}

/** Removes every sandbox container (of one run, or of all runs); returns how many. */
export async function removeSandboxContainers(docker: Docker, runId?: string): Promise<number> {
  const label = runId === undefined ? RUN_LABEL : `${RUN_LABEL}=${runId}`;
  const containers = await docker.listContainers({ all: true, filters: { label: [label] } });
  await Promise.all(
    containers.map((info) =>
      docker
        .getContainer(info.Id)
        .remove({ force: true })
        .catch((error: unknown) => {
          // Already gone (e.g. removed by a parallel cleanup) is fine.
          if (statusOf(error) !== 404) throw error;
        }),
    ),
  );
  return containers.length;
}

class DockerSandbox implements Sandbox {
  private stopped = false;

  constructor(
    readonly runId: string,
    private readonly container: Container,
  ) {}

  async exec(command: string, options: ExecOptions): Promise<ExecResult> {
    const tail = new OutputTail(options.tailLines ?? DEFAULT_TAIL_LINES);
    const seconds = Math.max(1, Math.ceil(options.timeoutMs / 1000));
    const started = Date.now();
    // `timeout` signals the whole process group, so children of the command die with it.
    const cmd = ['timeout', '--signal=KILL', `${seconds}s`, 'bash', '-lc', command];

    const result = await this.run(cmd, {
      cwd: resolveWorkspacePath(options.cwd ?? '.'),
      env: options.env ?? {},
      onData: (data) => tail.push(data),
      waitMs: options.timeoutMs + TIMEOUT_GRACE_MS,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const durationMs = Date.now() - started;
    const timedOut =
      result.exitCode === null ||
      (result.exitCode === KILLED_BY_TIMEOUT && durationMs >= options.timeoutMs - 1_000);

    return {
      exitCode: timedOut ? null : result.exitCode,
      output: tail.toString(),
      timedOut,
      truncated: tail.truncated,
      durationMs,
    };
  }

  async readFile(path: string, options: ReadFileOptions = {}): Promise<string> {
    const target = resolveWorkspacePath(path);
    const limit = options.maxBytes ?? DEFAULT_READ_LIMIT;
    const result = await this.runFileOp([
      'sh',
      '-c',
      'test -f "$1" || exit 3; head -c "$2" -- "$1"',
      'sh',
      target,
      String(limit + 1),
    ]);
    if (result.exitCode === 3) throw new SandboxError('file_not_found');
    this.assertSucceeded(result);
    if (result.stdout.length > limit) throw new SandboxError('file_too_large');
    return result.stdout.toString('utf8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    const target = resolveWorkspacePath(path);
    // Content travels base64-encoded in arguments, not through stdin: half-closing stdin of an
    // exec ends the whole stream on Windows named pipes. It is written next to the target and
    // moved over it at the end, so a failed write never leaves half a file.
    const encoded = Buffer.from(content, 'utf8').toString('base64');
    const temp = `${target}.aievo-write`;
    this.assertSucceeded(
      await this.runFileOp([
        'sh',
        '-c',
        'mkdir -p -- "$(dirname -- "$1")" && : > "$2"',
        'sh',
        target,
        temp,
      ]),
    );
    for (let offset = 0; offset < encoded.length; offset += WRITE_CHUNK_CHARS) {
      const chunk = encoded.slice(offset, offset + WRITE_CHUNK_CHARS);
      this.assertSucceeded(
        await this.runFileOp(['sh', '-c', 'printf %s "$2" | base64 -d >> "$1"', 'sh', temp, chunk]),
      );
    }
    this.assertSucceeded(await this.runFileOp(['mv', '-f', '--', temp, target]));
  }

  async listFiles(dir = '.', options: ListFilesOptions = {}): Promise<string[]> {
    const target = resolveWorkspacePath(dir);
    const result = await this.runFileOp([
      'rg',
      '--files',
      '--hidden',
      '--glob',
      '!.git',
      '--sort',
      'path',
      '--',
      target,
    ]);
    // ripgrep exits with 1 when it finds nothing.
    if (result.exitCode === 1 && result.stdout.length === 0) return [];
    this.assertSucceeded(result);
    return result.stdout
      .toString('utf8')
      .split('\n')
      .filter((line) => line !== '')
      .slice(0, options.limit ?? DEFAULT_LIST_LIMIT)
      .map(toWorkspaceRelative);
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    try {
      await this.container.remove({ force: true });
    } catch (error) {
      if (statusOf(error) !== 404) throw error;
    }
  }

  private assertSucceeded(result: RawResult): void {
    if (result.exitCode !== 0) {
      const detail = result.stderr.toString('utf8').trim().slice(-500);
      throw new SandboxError('command_failed', detail ? { detail } : undefined);
    }
  }

  private runFileOp(cmd: string[]): Promise<RawResult> {
    return this.run(cmd, { cwd: '/workspace', env: {}, waitMs: FILE_OP_TIMEOUT_MS, collect: true });
  }

  private async run(
    cmd: string[],
    options: {
      cwd: string;
      env: Record<string, string>;
      waitMs: number;
      signal?: AbortSignal;
      onData?: (data: Uint8Array) => void;
      collect?: boolean;
    },
  ): Promise<RawResult> {
    if (this.stopped) throw new SandboxError('stopped');
    if (options.signal?.aborted) throw new SandboxError('aborted');

    const exec = await this.container.exec({
      Cmd: cmd,
      WorkingDir: options.cwd,
      Env: Object.entries(options.env).map(([key, value]) => `${key}=${value}`),
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    stream.on(
      'data',
      createDemuxer((kind, data) => {
        options.onData?.(data);
        if (options.collect) (kind === 'stdout' ? stdout : stderr).push(Buffer.from(data));
      }),
    );

    const outcome = await new Promise<'ended' | 'timeout' | 'aborted'>((resolve, reject) => {
      const timer = setTimeout(() => finish('timeout'), options.waitMs);
      const onAbort = () => finish('aborted');
      options.signal?.addEventListener('abort', onAbort, { once: true });
      function finish(result: 'ended' | 'timeout' | 'aborted') {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        resolve(result);
      }
      stream.once('end', () => finish('ended'));
      stream.once('close', () => finish('ended'));
      stream.once('error', (error: Error) => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        reject(error);
      });
    });

    if (outcome !== 'ended') {
      stream.destroy();
      if (outcome === 'aborted') throw new SandboxError('aborted');
      return { exitCode: null, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
    }
    const info = await exec.inspect();
    return {
      exitCode: info.ExitCode,
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr),
    };
  }
}

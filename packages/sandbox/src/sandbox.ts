/** Where the run's working copy is mounted inside every sandbox. */
export const WORKSPACE_DIR = '/workspace';

export interface ExecOptions {
  /** Directory relative to `/workspace` (or absolute inside it); defaults to `/workspace`. */
  cwd?: string;
  /** Extra variables for this command only. Never pass secrets of the platform here. */
  env?: Record<string, string>;
  timeoutMs: number;
  /** Aborting stops waiting for the command; stopping the sandbox then ends its processes. */
  signal?: AbortSignal;
  /** How many of the last output lines to keep. */
  tailLines?: number;
}

export interface ExecResult {
  /** `null` when the command was killed by the timeout. */
  exitCode: number | null;
  /** The last `tailLines` lines of stdout and stderr, interleaved as they arrived. */
  output: string;
  timedOut: boolean;
  /** Whether lines were dropped from the start of the output. */
  truncated: boolean;
  durationMs: number;
}

export interface ReadFileOptions {
  maxBytes?: number;
}

export interface ListFilesOptions {
  /** Most paths to return; the rest are dropped. */
  limit?: number;
}

/**
 * An isolated environment for one run. Commands run in a container that sees only the run's
 * working copy under `/workspace`; paths outside it are refused.
 */
export interface Sandbox {
  readonly runId: string;
  /** Runs `command` with bash in the sandbox. */
  exec(command: string, options: ExecOptions): Promise<ExecResult>;
  readFile(path: string, options?: ReadFileOptions): Promise<string>;
  /** Creates missing parent directories. */
  writeFile(path: string, content: string): Promise<void>;
  /**
   * Absolute container path of `path` with every symlink resolved; missing trailing parts are
   * kept as they are. Lets callers refuse links that lead out of `/workspace`.
   */
  realPath(path: string): Promise<string>;
  /** Files under `dir` relative to `/workspace`, honouring `.gitignore`; `.git` is left out. */
  listFiles(dir?: string, options?: ListFilesOptions): Promise<string[]>;
  /** Removes the container with everything running in it. Safe to call more than once. */
  stop(): Promise<void>;
}

export interface SandboxLimits {
  memoryMb: number;
  cpus: number;
  pids: number;
}

export interface CreateSandboxInput {
  runId: string;
  /** Host directory with the working copy, mounted as `/workspace`. */
  workspaceDir: string;
  limits: SandboxLimits;
}

export interface SandboxFactory {
  create(input: CreateSandboxInput): Promise<Sandbox>;
}

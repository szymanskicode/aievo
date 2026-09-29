import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isValidAgentBranch } from './branch-name.js';
import { LocalGitError } from './local-git-error.js';

/** Result of one git process. */
export interface GitExecResult {
  stdout: string;
  stderr: string;
}

export interface GitExecOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs: number;
}

/** Runs the git binary with `args`; rejects like `child_process.execFile` does. */
export type GitExec = (args: string[], options: GitExecOptions) => Promise<GitExecResult>;

export interface LocalGitOptions {
  /**
   * Directory owned by the platform (outside any repository) for an empty hooks directory and
   * an empty global config, so nothing from the repository or the user's setup runs on the host.
   */
  stateDir: string;
  gitBinary?: string;
  /** Limit of a single git command. */
  timeoutMs?: number;
  /** Replaces the process runner; for tests. */
  exec?: GitExec;
}

export interface CloneInput {
  /** Plain remote URL, never with credentials in it. */
  url: string;
  dir: string;
  branch: string;
  token?: string;
  signal?: AbortSignal;
}

export interface CommitInput {
  message: string;
  author: { name: string; email: string };
  signal?: AbortSignal;
}

export interface PushInput {
  branch: string;
  /** The project's base branch; pushing to it is refused. */
  baseBranch: string;
  token: string;
  signal?: AbortSignal;
}

/**
 * Git operations on the host, on a working copy the sandbox also mounts. The token is handed
 * to each git process through its environment as an HTTP header and never lands in
 * `.git/config`, in a remote URL, in process arguments or in error messages.
 */
export interface LocalGit {
  clone(input: CloneInput): Promise<void>;
  /** Creates `name` from the current HEAD and switches to it. */
  createBranch(dir: string, name: string, signal?: AbortSignal): Promise<void>;
  /** Stages everything and commits; returns the commit SHA, or `null` when nothing changed. */
  commitAll(dir: string, input: CommitInput): Promise<string | null>;
  /** Pushes an agent branch to `origin`. Never forces and never writes the base branch. */
  pushAgentBranch(dir: string, input: PushInput): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Variables a git process may inherit. Everything else of the worker (the master key,
 * database URL, provider keys) stays out of it.
 */
const INHERITED_ENV = [
  'PATH',
  'Path',
  'SystemRoot',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
];

const defaultExec =
  (gitBinary: string): GitExec =>
  (args, options) =>
    new Promise((resolve, reject) => {
      execFile(
        gitBinary,
        args,
        {
          cwd: options.cwd,
          env: options.env,
          timeout: options.timeoutMs,
          killSignal: 'SIGKILL',
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true,
          encoding: 'utf8',
          ...(options.signal ? { signal: options.signal } : {}),
        },
        (error, stdout, stderr) => {
          if (error) reject(Object.assign(error, { stdout, stderr }));
          else resolve({ stdout, stderr });
        },
      );
    });

function basicAuth(token: string): string {
  return Buffer.from(`x-access-token:${token}`).toString('base64');
}

/** Removes every form of the token git could echo back. */
export function redactToken(text: string, token: string | undefined): string {
  if (!token) return text;
  let result = text;
  for (const secret of [token, basicAuth(token), Buffer.from(token).toString('base64')]) {
    result = result.split(secret).join('[redacted]');
  }
  return result;
}

/** The header config for the origin of `url`, passed through `GIT_CONFIG_*` variables. */
export function authEnv(url: string, token: string): NodeJS.ProcessEnv {
  // `C:\repo` parses as a URL with the scheme `c:`, so only http(s) counts as a remote.
  const parsed = URL.canParse(url) ? new URL(url) : null;
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    // A local path (tests): git never sends HTTP headers there.
    return {};
  }
  const origin = parsed.origin;
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `http.${origin}/.extraheader`,
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basicAuth(token)}`,
  };
}

interface RunOptions {
  cwd: string;
  token?: string;
  /** Remote the token is sent to; required with `token`. */
  remoteUrl?: string;
  signal?: AbortSignal;
}

export async function createLocalGit(options: LocalGitOptions): Promise<LocalGit> {
  const hooksDir = path.join(options.stateDir, 'empty-hooks');
  const globalConfig = path.join(options.stateDir, 'empty-gitconfig');
  await mkdir(hooksDir, { recursive: true });
  await writeFile(globalConfig, '');

  const exec = options.exec ?? defaultExec(options.gitBinary ?? 'git');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  function baseEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const name of INHERITED_ENV) {
      const value = process.env[name];
      if (value !== undefined) env[name] = value;
    }
    return {
      ...env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: globalConfig,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never',
      LC_ALL: 'C',
    };
  }

  // Flags on every command: the working copy is writable from the sandbox, so settings a
  // repository could smuggle in (hooks, fsmonitor, credential helpers) are overridden here.
  const safetyFlags = [
    '-c',
    `core.hooksPath=${hooksDir}`,
    '-c',
    'core.fsmonitor=false',
    '-c',
    'credential.helper=',
    '-c',
    'core.autocrlf=false',
  ];

  async function run(args: string[], opts: RunOptions): Promise<string> {
    const env = baseEnv();
    if (opts.token && opts.remoteUrl) Object.assign(env, authEnv(opts.remoteUrl, opts.token));
    try {
      const result = await exec([...safetyFlags, ...args], {
        cwd: opts.cwd,
        env,
        timeoutMs,
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      return result.stdout;
    } catch (error) {
      throw toLocalGitError(error, subcommand(args), opts.token);
    }
  }

  async function originUrl(dir: string, signal?: AbortSignal): Promise<string> {
    const url = await run(['config', '--get', 'remote.origin.url'], {
      cwd: dir,
      ...(signal ? { signal } : {}),
    });
    return url.trim();
  }

  return {
    async clone({ url, dir, branch, token, signal }) {
      await mkdir(path.dirname(dir), { recursive: true });
      await run(
        [
          'clone',
          '--branch',
          branch,
          '--single-branch',
          '--no-tags',
          // Stored in the copy, so git inside the sandbox sees files byte for byte too.
          '--config',
          'core.autocrlf=false',
          '--',
          url,
          dir,
        ],
        {
          cwd: path.dirname(dir),
          remoteUrl: url,
          ...(token ? { token } : {}),
          ...(signal ? { signal } : {}),
        },
      );
    },

    async createBranch(dir, name, signal) {
      if (!isValidAgentBranch(name)) throw new LocalGitError('invalid_branch');
      await run(['switch', '--create', name], { cwd: dir, ...(signal ? { signal } : {}) });
    },

    async commitAll(dir, { message, author, signal }) {
      const opts = { cwd: dir, ...(signal ? { signal } : {}) };
      await run(['add', '--all'], opts);
      const staged = await run(['diff', '--cached', '--name-only'], opts);
      if (staged.trim() === '') return null;
      await run(
        [
          '-c',
          `user.name=${author.name}`,
          '-c',
          `user.email=${author.email}`,
          'commit',
          '--no-verify',
          '--message',
          message,
        ],
        opts,
      );
      return (await run(['rev-parse', 'HEAD'], opts)).trim();
    },

    async pushAgentBranch(dir, { branch, baseBranch, token, signal }) {
      // Enforced here and not in any prompt: agents never write the base branch.
      if (!isValidAgentBranch(branch) || branch === baseBranch) {
        throw new LocalGitError('forbidden_push');
      }
      const ref = `refs/heads/${branch}`;
      const remoteUrl = await originUrl(dir, signal);
      // An explicit `src:dst` refspec without `+`, and no --force/--mirror/--all/--tags.
      await run(['push', '--no-verify', 'origin', `${ref}:${ref}`], {
        cwd: dir,
        token,
        remoteUrl,
        ...(signal ? { signal } : {}),
      });
    },
  };
}

const OUTPUT_TAIL_CHARS = 2_000;

/** The git subcommand of `args`, skipping `-c key=value` pairs. */
function subcommand(args: string[]): string {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '-c') i += 1;
    else return args[i] ?? 'git';
  }
  return 'git';
}

function toLocalGitError(error: unknown, command: string, token?: string): LocalGitError {
  const failure = error as {
    name?: string;
    code?: unknown;
    killed?: boolean;
    signal?: string | null;
    stderr?: string;
  };
  if (failure.name === 'AbortError' || failure.code === 'ABORT_ERR') {
    return new LocalGitError('aborted', { command });
  }
  if (failure.killed || failure.signal === 'SIGKILL') {
    return new LocalGitError('timeout', { command });
  }
  if (failure.code === 'ENOENT') return new LocalGitError('git_missing', { command });
  const output = redactToken(failure.stderr ?? '', token)
    .trim()
    .slice(-OUTPUT_TAIL_CHARS);
  return new LocalGitError('command_failed', {
    command,
    ...(typeof failure.code === 'number' ? { exitCode: failure.code } : {}),
    output,
  });
}

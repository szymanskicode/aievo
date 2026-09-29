import { homedir } from 'node:os';
import path from 'node:path';

import { MasterKeyError, parseMasterKey } from '@aievo/shared/crypto';
import { z } from 'zod';

/**
 * Where AIEvo keeps its data when `AIEVO_WORKDIR` is not set:
 * `%LOCALAPPDATA%\aievo` on Windows, `$XDG_DATA_HOME/aievo` (or `~/.local/share/aievo`) elsewhere.
 */
export function defaultDataDir(
  platform: NodeJS.Platform = process.platform,
  source: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  if (platform === 'win32') {
    return path.win32.join(
      source.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local'),
      'aievo',
    );
  }
  return path.posix.join(source.XDG_DATA_HOME ?? path.posix.join(home, '.local', 'share'), 'aievo');
}

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  // Default matches docker-compose.yml (local credentials, not a secret).
  DATABASE_URL: z.url().default('postgresql://aievo:aievo@127.0.0.1:5432/aievo'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Working copies of runs live in `<AIEVO_WORKDIR>/runs/<run id>`. */
  AIEVO_WORKDIR: z.string().min(1).optional(),
  AIEVO_SANDBOX_IMAGE: z.string().min(1).default('aievo-sandbox-node:1'),
  AIEVO_SANDBOX_MEMORY_MB: positiveInt(4096),
  AIEVO_SANDBOX_CPUS: z.coerce.number().positive().default(2),
  AIEVO_SANDBOX_PIDS: positiveInt(512),
  /** `uid:gid` of the sandbox user; by default the host user (Linux/macOS) or 1000:1000. */
  AIEVO_SANDBOX_USER: z.string().optional(),
  AIEVO_RUN_MAX_MINUTES: positiveInt(60),
  AIEVO_COMMAND_TIMEOUT_MINUTES: positiveInt(15),
  AIEVO_MAX_RUNS_PER_PROJECT: positiveInt(1),
  /** Runs this worker process executes at the same time (across projects). */
  AIEVO_WORKER_CONCURRENCY: positiveInt(2),
});

export type WorkerEnv = Omit<z.infer<typeof envSchema>, 'AIEVO_WORKDIR'> & {
  AIEVO_WORKDIR: string;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${issues}`);
  }

  return { ...result.data, AIEVO_WORKDIR: result.data.AIEVO_WORKDIR ?? defaultDataDir() };
}

/**
 * Reads `AIEVO_MASTER_KEY`, which decrypts the stored Git token. Kept apart from `loadEnv` so
 * the value never becomes part of the general config object.
 */
export function loadMasterKey(source: NodeJS.ProcessEnv = process.env): Buffer {
  try {
    return parseMasterKey(source.AIEVO_MASTER_KEY);
  } catch (error) {
    if (error instanceof MasterKeyError) {
      // The cause is safe to keep: MasterKeyError never contains the key itself.
      throw new Error(`Invalid environment configuration:\n  ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
}

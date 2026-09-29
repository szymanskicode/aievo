import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { defaultDataDir, loadEnv, loadMasterKey } from './env.js';

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({});

    expect(env).toMatchObject({
      AIEVO_SANDBOX_IMAGE: 'aievo-sandbox-node:1',
      AIEVO_SANDBOX_MEMORY_MB: 4096,
      AIEVO_SANDBOX_CPUS: 2,
      AIEVO_SANDBOX_PIDS: 512,
      AIEVO_RUN_MAX_MINUTES: 60,
      AIEVO_COMMAND_TIMEOUT_MINUTES: 15,
      AIEVO_MAX_RUNS_PER_PROJECT: 1,
      AIEVO_WORKER_CONCURRENCY: 2,
      LOG_LEVEL: 'info',
    });
    expect(env.AIEVO_WORKDIR).toBe(defaultDataDir());
  });

  it('reads numbers and the work directory', () => {
    const env = loadEnv({
      AIEVO_WORKDIR: '/data/aievo',
      AIEVO_SANDBOX_CPUS: '1.5',
      AIEVO_MAX_RUNS_PER_PROJECT: '2',
    });

    expect(env).toMatchObject({
      AIEVO_WORKDIR: '/data/aievo',
      AIEVO_SANDBOX_CPUS: 1.5,
      AIEVO_MAX_RUNS_PER_PROJECT: 2,
    });
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => loadEnv({ AIEVO_RUN_MAX_MINUTES: '0' })).toThrow(
      /Invalid environment configuration:\n {2}AIEVO_RUN_MAX_MINUTES/,
    );
  });
});

describe('loadMasterKey', () => {
  it('parses a valid key and reports a missing one without its value', () => {
    const key = randomBytes(32);

    expect(loadMasterKey({ AIEVO_MASTER_KEY: key.toString('base64') })).toEqual(key);
    expect(() => loadMasterKey({})).toThrow('Invalid environment configuration');
  });
});

describe('defaultDataDir', () => {
  it('uses LOCALAPPDATA on Windows', () => {
    expect(
      defaultDataDir('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me'),
    ).toBe('C:\\Users\\me\\AppData\\Local\\aievo');
    expect(defaultDataDir('win32', {}, 'C:\\Users\\me')).toBe(
      'C:\\Users\\me\\AppData\\Local\\aievo',
    );
  });

  it('uses XDG_DATA_HOME or ~/.local/share elsewhere', () => {
    expect(defaultDataDir('linux', { XDG_DATA_HOME: '/xdg' }, '/home/me')).toBe('/xdg/aievo');
    expect(defaultDataDir('darwin', {}, '/home/me')).toBe('/home/me/.local/share/aievo');
  });
});

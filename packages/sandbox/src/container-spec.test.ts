import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RUN_LABEL, buildContainerOptions } from './container-spec.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'aievo-spec-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const input = () => ({
  runId: 'run-1',
  workspaceDir: root,
  limits: { memoryMb: 2048, cpus: 1.5, pids: 256 },
  image: 'aievo-sandbox-node:1',
  user: '1000:1000',
});

describe('buildContainerOptions', () => {
  it('drops every capability and forbids privilege escalation', () => {
    const options = buildContainerOptions(input());

    expect(options.HostConfig?.CapDrop).toEqual(['ALL']);
    expect(options.HostConfig?.SecurityOpt).toEqual(['no-new-privileges:true']);
    expect(options.HostConfig?.Privileged).toBe(false);
    expect(options.User).toBe('1000:1000');
  });

  it('applies the limits and labels the container with the run', () => {
    const options = buildContainerOptions(input());

    expect(options.HostConfig).toMatchObject({
      Memory: 2048 * 1024 * 1024,
      MemorySwap: 2048 * 1024 * 1024,
      NanoCpus: 1_500_000_000,
      PidsLimit: 256,
    });
    expect(options.Labels).toEqual({ [RUN_LABEL]: 'run-1' });
    expect(options.name).toBe('aievo-run-run-1');
  });

  it('passes only its own variables, whatever the worker has in its environment', () => {
    process.env.GITHUB_TOKEN = 'must-not-leak';
    process.env.AIEVO_MASTER_KEY = 'must-not-leak';
    try {
      const env = buildContainerOptions(input()).Env ?? [];

      expect(env.join('\n')).not.toContain('must-not-leak');
      expect(env.map((entry) => entry.split('=')[0]).sort()).toEqual([
        'CI',
        'COREPACK_ENABLE_DOWNLOAD_PROMPT',
        'HOME',
      ]);
    } finally {
      delete process.env.GITHUB_TOKEN;
      delete process.env.AIEVO_MASTER_KEY;
    }
  });

  it('mounts the working copy, never the Docker socket', () => {
    const mounts = buildContainerOptions(input()).HostConfig?.Mounts ?? [];

    expect(mounts).toEqual([{ Type: 'bind', Source: root, Target: '/workspace', ReadOnly: false }]);
    expect(JSON.stringify(mounts)).not.toContain('docker.sock');
  });

  it('mounts .git read-only when the working copy has one', async () => {
    await mkdir(path.join(root, '.git'));

    const mounts = buildContainerOptions(input()).HostConfig?.Mounts ?? [];

    expect(mounts).toContainEqual({
      Type: 'bind',
      Source: path.join(root, '.git'),
      Target: '/workspace/.git',
      ReadOnly: true,
    });
  });
});

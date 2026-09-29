import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Docker from 'dockerode';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RUN_LABEL } from './container-spec.js';
import { createDockerSandboxFactory, removeSandboxContainers } from './docker-sandbox.js';
import { SandboxError } from './errors.js';
import { resolveSandboxUser } from './host-user.js';
import type { Sandbox } from './sandbox.js';
import { TEST_IMAGE } from './test/docker-setup.js';

const docker = new Docker();
const user = resolveSandboxUser(process.env.AIEVO_SANDBOX_USER);
const factory = createDockerSandboxFactory({ docker, image: TEST_IMAGE, user });
const limits = { memoryMb: 512, cpus: 1, pids: 128 };

let root: string;
let sandbox: Sandbox | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'aievo-sandbox-'));
  await mkdir(path.join(root, '.git'));
  await writeFile(path.join(root, '.git', 'config'), '[core]\n');
  await writeFile(path.join(root, 'README.md'), '# demo\n');
});

afterEach(async () => {
  await sandbox?.stop();
  sandbox = undefined;
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

afterAll(async () => {
  await removeSandboxContainers(docker);
});

async function start(runId = randomUUID()): Promise<Sandbox> {
  sandbox = await factory.create({ runId, workspaceDir: root, limits });
  return sandbox;
}

const run = (s: Sandbox, command: string, timeoutMs = 30_000) => s.exec(command, { timeoutMs });

describe('Docker sandbox', () => {
  it('runs a command in /workspace and returns its exit code and output', async () => {
    const s = await start();

    const ok = await run(s, 'pwd && cat README.md && echo oops >&2');
    const failed = await run(s, 'exit 3');

    expect(ok).toMatchObject({ exitCode: 0, timedOut: false, truncated: false });
    expect(ok.output).toBe('/workspace\n# demo\noops');
    expect(failed.exitCode).toBe(3);
  });

  it('has node, npm, pnpm, git and ripgrep', async () => {
    const s = await start();

    const result = await run(
      s,
      'node --version && npm --version && pnpm --version && git --version && rg --version',
      120_000,
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/^v22\./);
  });

  it('kills a command at its timeout, including its children', async () => {
    const s = await start();

    const result = await s.exec('sleep 30 & sleep 30; echo never', { timeoutMs: 2_000 });
    const leftovers = await run(s, 'pgrep -c -f "^sleep 30$" || true');
    // A write larger than one chunk goes through several execs.
    await s.writeFile('big.txt', 'x'.repeat(300_000));
    expect(await s.readFile('big.txt')).toHaveLength(300_000);

    expect(result).toMatchObject({ exitCode: null, timedOut: true });
    expect(result.durationMs).toBeLessThan(10_000);
    expect(result.output).not.toContain('never');
    expect(leftovers.output.trim()).toBe('0');
  });

  it('keeps only the last lines of long output', async () => {
    const s = await start();

    const result = await s.exec('seq 1 5000', { timeoutMs: 30_000, tailLines: 3 });

    expect(result.output).toBe('4998\n4999\n5000');
    expect(result.truncated).toBe(true);
  });

  it('runs as the configured user without root, capabilities or privilege escalation', async () => {
    const s = await start();

    const ids = await run(s, 'id -u; id -g');
    const caps = await run(s, "grep -E '^(CapEff|NoNewPrivs)' /proc/self/status");
    const escalate = await run(s, 'touch /etc/owned 2>&1; echo $?');

    expect(ids.output).toBe(user.replace(':', '\n'));
    expect(ids.output.split('\n')[0]).not.toBe('0');
    expect(caps.output).toMatch(/CapEff:\s+0000000000000000/);
    expect(caps.output).toMatch(/NoNewPrivs:\s+1/);
    expect(escalate.output.trim().split('\n').at(-1)).not.toBe('0');
  });

  it('has no secrets, no Docker socket and only its own variables', async () => {
    process.env.GITHUB_TOKEN = 'must-not-leak';
    try {
      const s = await start();

      const env = await run(s, 'env');
      const socket = await run(s, 'test -e /var/run/docker.sock && echo present || echo absent');

      expect(env.output).not.toMatch(/TOKEN|SECRET|API_KEY|MASTER_KEY|DATABASE_URL|AIEVO_/);
      expect(env.output).not.toContain('must-not-leak');
      expect(socket.output).toBe('absent');
    } finally {
      delete process.env.GITHUB_TOKEN;
    }
  });

  it('can write the working copy but not .git', async () => {
    const s = await start();

    const write = await run(s, 'echo hi > created.txt && echo ok');
    const git = await run(
      s,
      '{ echo evil >> .git/config; } 2>/dev/null && echo written || echo refused',
    );

    expect(write.output).toBe('ok');
    expect(await readFile(path.join(root, 'created.txt'), 'utf8')).toBe('hi\n');
    expect(git.output).toBe('refused');
    expect(await readFile(path.join(root, '.git', 'config'), 'utf8')).toBe('[core]\n');
  });

  it('reads, writes and lists files inside /workspace only', async () => {
    const s = await start();

    await s.writeFile('src/deep/new.ts', 'export const x = "ą";\n');
    const content = await s.readFile('src/deep/new.ts');
    const files = await s.listFiles();

    expect(content).toBe('export const x = "ą";\n');
    expect(await readFile(path.join(root, 'src', 'deep', 'new.ts'), 'utf8')).toBe(content);
    expect(files).toEqual(['README.md', 'src/deep/new.ts']);
    expect(await s.listFiles('src')).toEqual(['src/deep/new.ts']);
    await expect(s.readFile('missing.txt')).rejects.toMatchObject({ kind: 'file_not_found' });
    await expect(s.readFile('README.md', { maxBytes: 3 })).rejects.toMatchObject({
      kind: 'file_too_large',
    });
    await expect(s.readFile('../etc/passwd')).rejects.toBeInstanceOf(SandboxError);
    await expect(s.writeFile('/etc/x', 'x')).rejects.toMatchObject({
      kind: 'path_outside_workspace',
    });
  });

  it('resolves symlinks in real paths', async () => {
    const s = await start();
    await run(s, 'mkdir -p src && ln -s /etc src/etc-link && ln -s ../README.md src/readme');

    expect(await s.realPath('src/etc-link/passwd')).toBe('/etc/passwd');
    expect(await s.realPath('src/readme')).toBe('/workspace/README.md');
    expect(await s.realPath('src/new/file.ts')).toBe('/workspace/src/new/file.ts');
  });

  it('stops waiting when aborted', async () => {
    const s = await start();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 500);

    await expect(
      s.exec('sleep 30', { timeoutMs: 60_000, signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('removes its container on stop, and cleanup finds leftovers by label', async () => {
    const runId = randomUUID();
    const s = await start(runId);
    const byLabel = () =>
      docker.listContainers({ all: true, filters: { label: [`${RUN_LABEL}=${runId}`] } });
    expect(await byLabel()).toHaveLength(1);

    await s.stop();
    await s.stop();
    sandbox = undefined;
    expect(await byLabel()).toHaveLength(0);
    await expect(run(s, 'true')).rejects.toMatchObject({ kind: 'stopped' });

    const orphan = await factory.create({ runId, workspaceDir: root, limits });
    expect(await removeSandboxContainers(docker, runId)).toBe(1);
    expect(await byLabel()).toHaveLength(0);
    await orphan.stop();
  });

  it('reports a missing image', async () => {
    const missing = createDockerSandboxFactory({ docker, image: 'aievo-missing-image:0', user });

    await expect(
      missing.create({ runId: randomUUID(), workspaceDir: root, limits }),
    ).rejects.toMatchObject({ kind: 'image_missing' });
  });
});

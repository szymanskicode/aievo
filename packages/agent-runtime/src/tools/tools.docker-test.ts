import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDockerSandboxFactory, resolveSandboxUser } from '@aievo/sandbox';
import type { Sandbox } from '@aievo/sandbox';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toolContext } from '../test/context.js';
import { gitDiffTool, runCommandTool, searchCodeTool } from './command-tools.js';
import { resolveToolPath } from './paths.js';
import type { Tool } from './tool.js';

// Needs Docker and the sandbox image (`pnpm sandbox:build`).
const image = process.env.AIEVO_SANDBOX_IMAGE ?? 'aievo-sandbox-node:1';
const factory = createDockerSandboxFactory({
  image,
  user: resolveSandboxUser(process.env.AIEVO_SANDBOX_USER),
});

let root: string;
let sandbox: Sandbox;

function git(...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root });
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'aievo-tools-'));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src', 'math.ts'), 'export const one = 1;\n');
  await writeFile(path.join(root, 'README.md'), "It's a demo\n");
  git('init', '-q', '-b', 'main');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  sandbox = await factory.create({
    runId: randomUUID(),
    workspaceDir: root,
    limits: { memoryMb: 512, cpus: 1, pids: 128 },
  });
});

afterAll(async () => {
  await sandbox.stop();
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

function run(tool: Tool, args: unknown) {
  return tool.execute(tool.input.parse(args), toolContext(sandbox));
}

describe('tools in a real sandbox', () => {
  it('searches with ripgrep, quoting included', async () => {
    expect((await run(searchCodeTool, { pattern: "It's" })).output).toBe("README.md:1:It's a demo");
    expect((await run(searchCodeTool, { pattern: 'one\\s=', regex: true })).output).toBe(
      'src/math.ts:1:export const one = 1;',
    );
    expect((await run(searchCodeTool, { pattern: 'absent' })).output).toBe('No matches.');
    await expect(run(searchCodeTool, { pattern: '(', regex: true })).rejects.toThrow(
      /Search failed/,
    );
  });

  it('stops ripgrep at the result limit', async () => {
    await sandbox.writeFile('many.txt', 'hit\n'.repeat(50));

    const result = await run(searchCodeTool, { pattern: 'hit', maxResults: 5 });

    expect(result.output).toMatch(/\[more than 5 matches; refine the search\]$/);
  });

  it('shows changed and new files against the base ref', async () => {
    await sandbox.writeFile('src/math.ts', 'export const one = 1;\nexport const two = 2;\n');
    await sandbox.writeFile('src/new.ts', 'export const three = 3;\n');

    const diff = (await run(gitDiffTool, {})).output;

    expect(diff).toContain('+export const two = 2;');
    expect(diff).toContain('+++ b/src/new.ts');
    expect(diff).toContain('+export const three = 3;');
  });

  it('refuses symlinks leading out of /workspace', async () => {
    await sandbox.exec('ln -sfn /etc etc-link', { timeoutMs: 10_000 });

    await expect(resolveToolPath(toolContext(sandbox), 'etc-link/passwd')).rejects.toThrow(
      /symbolic link/,
    );
  });

  it('runs allowed commands', async () => {
    const context = {
      ...toolContext(sandbox),
      commands: { allowed: [{ command: 'node --version', allowArgs: false }] },
    };

    const result = await runCommandTool.execute({ command: 'node --version' }, context);

    expect(result).toMatchObject({ exitCode: 0, isError: false });
    expect(result.output).toMatch(/^Exit code: 0\nv\d+\./);
  });
});

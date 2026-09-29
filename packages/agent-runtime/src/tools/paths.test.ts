import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { toolContext } from '../test/context.js';
import { createTempDirSandbox } from '../test/temp-dir-sandbox.js';
import type { TempDirSandbox } from '../test/temp-dir-sandbox.js';
import { resolveToolPath, resolveWritablePath } from './paths.js';

let sandbox: TempDirSandbox;
let outside: string;

beforeEach(async () => {
  sandbox = await createTempDirSandbox();
  outside = await mkdtemp(path.join(tmpdir(), 'aievo-outside-'));
  await writeFile(path.join(outside, 'secret.txt'), 'secret');
  await mkdir(path.join(sandbox.root, 'src'));
  await writeFile(path.join(sandbox.root, 'src', 'a.ts'), 'export {};\n');
  // A junction works on Windows without extra rights and is a plain symlink elsewhere.
  await symlink(outside, path.join(sandbox.root, 'escape'), 'junction');
  await symlink(path.join(sandbox.root, 'src'), path.join(sandbox.root, 'src-link'), 'junction');
});

afterEach(async () => {
  await sandbox.cleanup();
  await rm(outside, { recursive: true, force: true });
});

describe('resolveToolPath', () => {
  it('resolves relative and absolute paths inside /workspace', async () => {
    const context = toolContext(sandbox);

    expect(await resolveToolPath(context, 'src/a.ts')).toEqual({
      absolute: '/workspace/src/a.ts',
      relative: 'src/a.ts',
    });
    expect(await resolveToolPath(context, '/workspace/src/../src/a.ts')).toMatchObject({
      relative: 'src/a.ts',
    });
    expect(await resolveToolPath(context, '.')).toEqual({ absolute: '/workspace', relative: '.' });
    expect(await resolveToolPath(context, 'src/new/file.ts')).toMatchObject({
      relative: 'src/new/file.ts',
    });
  });

  it.each(['../etc/passwd', '/etc/passwd', 'src/../../x', '/workspace-other/a', 'a\0b'])(
    'refuses %j',
    async (input) => {
      await expect(resolveToolPath(toolContext(sandbox), input)).rejects.toMatchObject({
        name: 'ToolError',
        message: expect.stringContaining('outside /workspace') as string,
      });
    },
  );

  it('refuses symlinks that lead outside /workspace', async () => {
    await expect(resolveToolPath(toolContext(sandbox), 'escape/secret.txt')).rejects.toThrow(
      /symbolic link/,
    );
    await expect(resolveToolPath(toolContext(sandbox), 'escape/new.txt')).rejects.toThrow(
      /symbolic link/,
    );
  });

  it('follows symlinks that stay inside /workspace', async () => {
    expect(await resolveToolPath(toolContext(sandbox), 'src-link/a.ts')).toMatchObject({
      relative: 'src/a.ts',
    });
  });
});

describe('resolveWritablePath', () => {
  it('allows paths matching the write globs', async () => {
    const context = toolContext(sandbox, {
      permissions: { writeGlobs: ['src/**', '**/*.test.ts'] },
    });

    expect(await resolveWritablePath(context, 'src/b.ts')).toMatchObject({ relative: 'src/b.ts' });
    expect(await resolveWritablePath(context, 'tests/x.test.ts')).toMatchObject({
      relative: 'tests/x.test.ts',
    });
  });

  it('refuses paths outside the write globs and names the allowed ones', async () => {
    const context = toolContext(sandbox, { permissions: { writeGlobs: ['**/*.test.ts'] } });

    await expect(resolveWritablePath(context, 'src/a.ts')).rejects.toThrow(
      'This agent may not write "src/a.ts". Allowed paths: **/*.test.ts.',
    );
  });

  it('checks the globs against the real path behind a symlink', async () => {
    const context = toolContext(sandbox, { permissions: { writeGlobs: ['src-link/**'] } });

    await expect(resolveWritablePath(context, 'src-link/a.ts')).rejects.toThrow(
      /may not write "src\/a.ts"/,
    );
  });

  it('refuses every write for an agent without write permission', async () => {
    const context = toolContext(sandbox, { permissions: { writeGlobs: null } });

    await expect(resolveWritablePath(context, 'src/a.ts')).rejects.toThrow(
      'This agent may not write files.',
    );
  });

  it.each(['.git/config', '.git/hooks/pre-commit', 'lib/.git/config', '.'])(
    'never allows writing %j',
    async (input) => {
      await expect(resolveWritablePath(toolContext(sandbox), input)).rejects.toThrow(/\.git/);
    },
  );
});

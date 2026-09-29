import { exec } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadTemplateFiles } from './templates.js';

const run = promisify(exec);

/** Through a shell, because npm is a `.cmd` script on Windows; the arguments are constants. */
async function npm(cwd: string, ...args: string[]) {
  return run(['npm', ...args].join(' '), { cwd, maxBuffer: 64 << 20 });
}

/** The template as a user gets it: the files of the initial commit, then an install. */
describe('react-vite-ts template', () => {
  let dir: string | undefined;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aievo-react-vite-ts-'));
    const { files } = await loadTemplateFiles('react-vite-ts', {
      projectName: 'template-check',
      packageName: 'template-check',
      projectDescription: 'Checks that the template works',
    });
    for (const file of files) {
      await mkdir(dirname(join(dir, file.path)), { recursive: true });
      await writeFile(join(dir, file.path), file.content);
    }
    // `npm ci` also fails when package-lock.json no longer matches package.json.
    await npm(dir, 'ci', '--no-audit', '--no-fund');
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  function cwd(): string {
    if (!dir) throw new Error('Template was not prepared');
    return dir;
  }

  it('passes its tests', async () => {
    const { stdout } = await npm(cwd(), 'test');
    expect(stdout).toMatch(/1 passed/);
  });

  it('reports coverage', async () => {
    await npm(cwd(), 'run', 'test:coverage');
    const summary = JSON.parse(
      await readFile(join(cwd(), 'coverage', 'coverage-summary.json'), 'utf8'),
    ) as Record<string, { lines: { pct: number } }>;

    expect(summary.total?.lines.pct).toBe(100);
  });

  it('passes lint', async () => {
    await expect(npm(cwd(), 'run', 'lint')).resolves.toBeDefined();
  });

  it('builds', async () => {
    await expect(npm(cwd(), 'run', 'build')).resolves.toBeDefined();
  });
});

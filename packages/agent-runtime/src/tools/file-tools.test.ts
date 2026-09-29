import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { toolContext } from '../test/context.js';
import { createTempDirSandbox } from '../test/temp-dir-sandbox.js';
import type { TempDirSandbox } from '../test/temp-dir-sandbox.js';
import {
  LIST_FILES_LIMIT,
  READ_FILE_MAX_BYTES,
  READ_FILE_MAX_LINES,
  editFileTool,
  listFilesTool,
  readFileTool,
  writeFileTool,
} from './file-tools.js';
import type { Tool } from './tool.js';

let sandbox: TempDirSandbox;

async function put(file: string, content: string): Promise<void> {
  const target = path.join(sandbox.root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

function run(tool: Tool, args: unknown, context = toolContext(sandbox)) {
  return tool.execute(tool.input.parse(args), context);
}

beforeEach(async () => {
  sandbox = await createTempDirSandbox();
});

afterEach(async () => {
  await sandbox.cleanup();
});

describe('list_files', () => {
  beforeEach(async () => {
    await put('README.md', '# demo\n');
    await put('src/a.ts', '');
    await put('src/a.test.ts', '');
    await put('src/lib/b.ts', '');
    await put('.git/config', '');
    await put('.github/workflows/ci.yml', '');
  });

  it('lists every file without .git', async () => {
    expect((await run(listFilesTool, {})).output).toBe(
      ['.github/workflows/ci.yml', 'README.md', 'src/a.test.ts', 'src/a.ts', 'src/lib/b.ts'].join(
        '\n',
      ),
    );
  });

  it('matches dotfiles with a glob', async () => {
    expect((await run(listFilesTool, { glob: '**/*.yml' })).output).toBe(
      '.github/workflows/ci.yml',
    );
  });

  it('filters by a glob relative to the directory', async () => {
    expect((await run(listFilesTool, { path: 'src', glob: '*.ts' })).output).toBe(
      'src/a.test.ts\nsrc/a.ts',
    );
    expect((await run(listFilesTool, { glob: '**/*.test.ts' })).output).toBe('src/a.test.ts');
  });

  it('says when nothing matches', async () => {
    expect((await run(listFilesTool, { glob: '*.py' })).output).toBe('No files found.');
  });

  it('cuts long listings', async () => {
    for (let i = 0; i < LIST_FILES_LIMIT + 3; i++)
      await put(`many/f${String(i).padStart(4, '0')}.txt`, '');

    const { output } = await run(listFilesTool, { path: 'many' });

    expect(output.split('\n')).toHaveLength(LIST_FILES_LIMIT + 1);
    expect(output).toMatch(/\[3 more files not shown/);
  });
});

describe('read_file', () => {
  it('returns numbered lines', async () => {
    await put('src/a.ts', 'one\ntwo\nthree\n');

    expect((await run(readFileTool, { path: 'src/a.ts' })).output).toBe('1| one\n2| two\n3| three');
  });

  it('returns a range of lines', async () => {
    await put('src/a.ts', 'one\ntwo\nthree\nfour');

    expect((await run(readFileTool, { path: 'src/a.ts', startLine: 2, endLine: 3 })).output).toBe(
      '2| two\n3| three',
    );
    expect((await run(readFileTool, { path: 'src/a.ts', startLine: 3, endLine: 99 })).output).toBe(
      '3| three\n4| four',
    );
  });

  it('pages through long files', async () => {
    const lines = Array.from({ length: READ_FILE_MAX_LINES + 10 }, (_, i) => `line ${i + 1}`);
    await put('big.txt', lines.join('\n'));

    const first = await run(readFileTool, { path: 'big.txt' });
    const rest = await run(readFileTool, { path: 'big.txt', startLine: READ_FILE_MAX_LINES + 1 });

    expect(first.output).toContain(
      `[lines 1-${READ_FILE_MAX_LINES} of ${READ_FILE_MAX_LINES + 10}; read on with startLine ${READ_FILE_MAX_LINES + 1}]`,
    );
    expect(rest.output.split('\n')).toHaveLength(10);
  });

  it('marks an empty file', async () => {
    await put('empty.txt', '');

    expect((await run(readFileTool, { path: 'empty.txt' })).output).toBe('[empty file]');
  });

  it('refuses ranges outside the file', async () => {
    await put('a.txt', 'one\ntwo\n');

    await expect(run(readFileTool, { path: 'a.txt', startLine: 5 })).rejects.toThrow(
      'The file has 2 lines; startLine 5 is past its end.',
    );
    await expect(run(readFileTool, { path: 'a.txt', startLine: 2, endLine: 1 })).rejects.toThrow(
      'endLine must not be before startLine.',
    );
  });

  it('fails for missing and too large files', async () => {
    await put('huge.txt', 'x'.repeat(READ_FILE_MAX_BYTES + 1));

    await expect(run(readFileTool, { path: 'missing.ts' })).rejects.toMatchObject({
      kind: 'file_not_found',
    });
    await expect(run(readFileTool, { path: 'huge.txt' })).rejects.toMatchObject({
      kind: 'file_too_large',
    });
  });

  it('refuses paths outside /workspace', async () => {
    await expect(run(readFileTool, { path: '../../etc/passwd' })).rejects.toThrow(
      /outside \/workspace/,
    );
  });
});

describe('write_file', () => {
  it('creates a file with its directories', async () => {
    const result = await run(writeFileTool, {
      path: 'src/new/c.ts',
      content: 'export const c = 1;\n',
    });

    expect(result.output).toBe('Wrote src/new/c.ts (20 characters).');
    expect(await readFile(path.join(sandbox.root, 'src/new/c.ts'), 'utf8')).toBe(
      'export const c = 1;\n',
    );
  });

  it('refuses paths outside the write globs', async () => {
    const context = toolContext(sandbox, { permissions: { writeGlobs: ['**/*.test.ts'] } });

    await expect(run(writeFileTool, { path: 'src/a.ts', content: 'x' }, context)).rejects.toThrow(
      /may not write "src\/a.ts"/,
    );
    await expect(
      run(writeFileTool, { path: 'src/a.test.ts', content: 'x' }, context),
    ).resolves.toMatchObject({
      output: 'Wrote src/a.test.ts (1 characters).',
    });
  });

  it('refuses writes into .git', async () => {
    await expect(
      run(writeFileTool, { path: '.git/hooks/post-commit', content: 'x' }),
    ).rejects.toThrow(/\.git is managed by the platform/);
  });
});

describe('edit_file', () => {
  beforeEach(async () => {
    await put('src/a.ts', 'const a = 1;\nconst b = 2;\nconst a2 = 1;\n');
  });

  it('replaces a unique fragment', async () => {
    const result = await run(editFileTool, {
      path: 'src/a.ts',
      find: 'const b = 2;',
      replace: 'const b = 3;',
    });

    expect(result.output).toBe('Edited src/a.ts.');
    expect(await readFile(path.join(sandbox.root, 'src/a.ts'), 'utf8')).toBe(
      'const a = 1;\nconst b = 3;\nconst a2 = 1;\n',
    );
  });

  it('refuses an ambiguous fragment and leaves the file alone', async () => {
    await expect(
      run(editFileTool, { path: 'src/a.ts', find: '= 1;', replace: '= 9;' }),
    ).rejects.toThrow(
      'The text to find occurs 2 times in src/a.ts; include more surrounding lines so it is unique.',
    );
    expect(await readFile(path.join(sandbox.root, 'src/a.ts'), 'utf8')).toContain('const a = 1;');
  });

  it('refuses a fragment that does not occur', async () => {
    await expect(
      run(editFileTool, { path: 'src/a.ts', find: 'const c', replace: 'x' }),
    ).rejects.toThrow(/does not occur in src\/a.ts/);
  });

  it('checks write permissions before reading', async () => {
    const context = toolContext(sandbox, { permissions: { writeGlobs: null } });

    await expect(
      run(editFileTool, { path: 'src/a.ts', find: 'const b', replace: 'x' }, context),
    ).rejects.toThrow('This agent may not write files.');
  });
});

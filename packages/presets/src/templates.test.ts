import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  InvalidTemplateError,
  TemplateNotFoundError,
  decodeText,
  getTemplate,
  listTemplates,
  loadTemplateFiles,
  substitute,
  toPackageName,
} from './templates.js';
import type { TemplateVariables } from './templates.js';

const variables: TemplateVariables = {
  projectName: 'Aievo-Playground',
  packageName: 'aievo-playground',
  projectDescription: 'A place to play',
};

const temporaryDirs: string[] = [];

/** A templates directory with the given files, removed after the test. */
async function templatesDir(files: Record<string, string | Uint8Array>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aievo-templates-'));
  temporaryDirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true })));
});

describe('built-in templates', () => {
  it('have valid manifests', async () => {
    const templates = await listTemplates();

    expect(templates.map((template) => template.id)).toEqual(['empty', 'react-vite-ts']);
  });

  it('configure the React template as described in docs/architecture.md, section 10', async () => {
    const { manifest } = await getTemplate('react-vite-ts');

    expect(manifest.commands).toEqual({
      install: 'npm install',
      dev: 'npm run dev -- --host 0.0.0.0 --port 5173',
      build: 'npm run build',
      lint: 'npm run lint',
      test: 'npm test',
      coverage: 'npm run test:coverage',
    });
    expect(manifest.preview).toEqual({ port: 5173, readyPath: '/' });
    expect(manifest.testPolicy.framework).toBe('vitest');
    expect(manifest.context).toEqual(['docs/CONVENTIONS.md']);
  });

  it.each(['empty', 'react-vite-ts'])(
    '%s: every file is text, placeholders are all known and the context files exist',
    async (id) => {
      const { manifest } = await getTemplate(id);
      const { files, skipped } = await loadTemplateFiles(id, variables);
      const paths = files.map((file) => file.path);

      expect(skipped).toEqual([]);
      expect(paths).toContain('README.md');
      expect(paths).toContain('.gitignore');
      expect(paths).not.toContain('template.yaml');
      for (const file of files) expect(file.content).not.toMatch(/\{\{\w+\}\}/);
      for (const path of manifest.context) expect(paths).toContain(path);
    },
  );

  it('names the npm package and the page after the project', async () => {
    const { files } = await loadTemplateFiles('react-vite-ts', variables);
    const file = (path: string) => files.find((candidate) => candidate.path === path)?.content;

    expect(JSON.parse(file('package.json') ?? '{}')).toMatchObject({ name: 'aievo-playground' });
    expect(file('README.md')).toContain('# Aievo-Playground\n\nA place to play');
    expect(file('src/App.tsx')).toContain('<h1>Aievo-Playground</h1>');
  });
});

describe('listTemplates', () => {
  it('rejects a template with an invalid manifest', async () => {
    const dir = await templatesDir({ 'broken/template.yaml': 'name: Broken\n' });

    await expect(listTemplates({ dir })).rejects.toBeInstanceOf(InvalidTemplateError);
  });
});

describe('loadTemplateFiles', () => {
  it('substitutes placeholders and skips binary files', async () => {
    const dir = await templatesDir({
      'demo/template.yaml': 'name: Demo\ndescription: Demo template\n',
      'demo/README.md': '# {{projectName}} ({{packageName}})\n{{projectDescription}} {{unknown}}\n',
      'demo/nested/deep/file.txt': 'plain',
      'demo/logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]),
    });

    const loaded = await loadTemplateFiles('demo', variables, { dir });

    expect(loaded).toEqual({
      template: {
        id: 'demo',
        manifest: expect.objectContaining({ name: 'Demo', description: 'Demo template' }),
      },
      files: [
        {
          path: 'README.md',
          content: '# Aievo-Playground (aievo-playground)\nA place to play {{unknown}}\n',
        },
        { path: 'nested/deep/file.txt', content: 'plain' },
      ],
      skipped: ['logo.png'],
    });
  });

  it('rejects an unknown template', async () => {
    await expect(loadTemplateFiles('missing', variables)).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    );
  });
});

describe('substitute', () => {
  it('does not read placeholders from the object prototype', () => {
    expect(substitute('{{toString}}', variables)).toBe('{{toString}}');
  });
});

describe('decodeText', () => {
  it('treats NUL bytes and invalid UTF-8 as binary', () => {
    expect(decodeText(new TextEncoder().encode('zażółć'))).toBe('zażółć');
    expect(decodeText(new Uint8Array([0x61, 0x00]))).toBeNull();
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x61]))).toBeNull();
  });
});

describe('toPackageName', () => {
  it('turns a repository name into a valid npm package name', () => {
    expect(toPackageName('My.Repo_Name')).toBe('my.repo_name');
    expect(toPackageName('_hidden')).toBe('hidden');
    expect(toPackageName('...')).toBe('app');
  });
});

import { describe, expect, it } from 'vitest';

import { templateManifestSchema } from './template.js';

describe('templateManifestSchema', () => {
  it('fills defaults for a minimal manifest', () => {
    const manifest = templateManifestSchema.parse({ name: 'Empty', description: 'Nothing yet' });

    expect(manifest).toMatchObject({
      commands: {},
      preview: null,
      services: [],
      context: [],
    });
    expect(manifest.testPolicy.framework).toBe('auto');
    expect(manifest.testPolicy.changedLines.minLineCoverage).toBe(80);
  });

  it('accepts the manifest shape from docs/architecture.md, section 10', () => {
    const manifest = templateManifestSchema.parse({
      name: 'React + Vite + TypeScript + Vitest',
      description: 'SPA',
      commands: { install: 'npm install', test: 'npm test' },
      preview: { port: 5173, readyPath: '/' },
      services: [],
      testPolicy: { framework: 'vitest', changedLines: { minLineCoverage: 80 } },
      context: ['docs/CONVENTIONS.md'],
    });

    expect(manifest.preview).toEqual({ port: 5173, readyPath: '/' });
    expect(manifest.testPolicy.framework).toBe('vitest');
  });

  it('rejects unknown keys and test commands inside the policy', () => {
    expect(
      templateManifestSchema.safeParse({ name: 'A', description: 'B', extra: 1 }).success,
    ).toBe(false);
    expect(
      templateManifestSchema.safeParse({
        name: 'A',
        description: 'B',
        testPolicy: { commands: { test: 'x' } },
      }).success,
    ).toBe(false);
  });
});

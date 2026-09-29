import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NPM_COMMANDS,
  createProjectSchema,
  previewSchema,
  projectSettingsSchema,
  testPolicySchema,
  updateProjectSchema,
} from './project.js';

describe('projectSettingsSchema', () => {
  it('defaults to no commands', () => {
    expect(projectSettingsSchema.parse({})).toEqual({ commands: {} });
  });

  it('accepts run limits and refuses invalid ones', () => {
    expect(projectSettingsSchema.parse({ limits: { maxRunCostUsd: 2.5 } }).limits).toEqual({
      maxRunCostUsd: 2.5,
    });
    for (const limits of [{ maxIterations: 0 }, { maxRunCostUsd: -1 }, { maxRunMinutes: 1.5 }]) {
      expect(projectSettingsSchema.safeParse({ limits }).success).toBe(false);
    }
  });

  it('rejects a blank command', () => {
    expect(projectSettingsSchema.safeParse({ commands: { test: '  ' } }).success).toBe(false);
  });
});

describe('testPolicySchema', () => {
  it('produces the full default policy from an empty object', () => {
    expect(testPolicySchema.parse({})).toEqual({
      framework: 'auto',
      commands: { test: 'pnpm test', coverage: 'pnpm test --coverage --reporter=json' },
      coverageFormat: 'istanbul-json',
      changedLines: { minLineCoverage: 80, minBranchCoverage: null },
      global: { failIfDropsBy: 1 },
      requiredTypes: {
        unit: 'always',
        integration: 'on_api_change',
        e2e: 'on_acceptance_criteria',
      },
      testPaths: ['**/*.test.ts', '**/*.spec.ts', 'tests/**'],
      exclude: ['**/*.d.ts', 'src/generated/**'],
      audit: { onEveryRun: true, scheduled: 'weekly', allowDeleteTests: 'require_human' },
    });
  });

  it('fills defaults inside a partially provided section', () => {
    const policy = testPolicySchema.parse({ changedLines: { minLineCoverage: 90 } });
    expect(policy.changedLines).toEqual({ minLineCoverage: 90, minBranchCoverage: null });
  });

  it('rejects coverage above 100%', () => {
    expect(testPolicySchema.safeParse({ changedLines: { minLineCoverage: 120 } }).success).toBe(
      false,
    );
  });
});

describe('createProjectSchema', () => {
  const existing = {
    mode: 'existing',
    owner: 'octocat',
    repo: 'hello-world',
    defaultBranch: 'main',
  } as const;

  it('accepts an existing repository without a name or commands', () => {
    expect(createProjectSchema.parse(existing)).toEqual(existing);
  });

  it('accepts a new repository and makes it private by default', () => {
    expect(
      createProjectSchema.parse({
        mode: 'new',
        name: 'aievo-playground',
        owner: 'octocat',
        template: 'react-vite-ts',
      }),
    ).toEqual({
      mode: 'new',
      name: 'aievo-playground',
      owner: 'octocat',
      template: 'react-vite-ts',
      private: true,
    });
  });

  it('rejects a body without a known mode', () => {
    expect(createProjectSchema.safeParse({ name: 'Demo' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...existing, mode: 'none' }).success).toBe(false);
  });

  it('rejects unknown fields such as workspaceId', () => {
    expect(createProjectSchema.safeParse({ ...existing, workspaceId: 'x' }).success).toBe(false);
  });

  it('rejects repository names and branches GitHub would refuse', () => {
    expect(createProjectSchema.safeParse({ ...existing, repo: 'has space' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...existing, repo: '..' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...existing, owner: '-bad' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...existing, defaultBranch: 'a b' }).success).toBe(
      false,
    );
    expect(
      createProjectSchema.safeParse({
        mode: 'new',
        name: 'a/b',
        owner: 'octocat',
        template: 'empty',
      }).success,
    ).toBe(false);
  });
});

describe('DEFAULT_NPM_COMMANDS', () => {
  it('is a valid set of project commands', () => {
    expect(projectSettingsSchema.parse({ commands: DEFAULT_NPM_COMMANDS }).commands).toEqual(
      DEFAULT_NPM_COMMANDS,
    );
  });
});

describe('previewSchema', () => {
  it('defaults the ready path to the root and rejects invalid ports', () => {
    expect(previewSchema.parse({ port: 5173 })).toEqual({ port: 5173, readyPath: '/' });
    expect(previewSchema.safeParse({ port: 0 }).success).toBe(false);
    expect(previewSchema.safeParse({ port: 5173, readyPath: 'x' }).success).toBe(false);
  });
});

describe('updateProjectSchema', () => {
  it('leaves settings out when they are not provided', () => {
    expect(updateProjectSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  });

  it('does not let a patch change the linked repository', () => {
    expect(updateProjectSchema.safeParse({ repoUrl: 'https://github.com/a/b' }).success).toBe(
      false,
    );
  });

  it('accepts an empty patch', () => {
    expect(updateProjectSchema.parse({})).toEqual({});
  });
});

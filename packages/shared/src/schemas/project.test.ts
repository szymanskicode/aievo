import { describe, expect, it } from 'vitest';

import { projectSettingsSchema, testPolicySchema } from './project.js';

describe('projectSettingsSchema', () => {
  it('defaults to no commands', () => {
    expect(projectSettingsSchema.parse({})).toEqual({ commands: {} });
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

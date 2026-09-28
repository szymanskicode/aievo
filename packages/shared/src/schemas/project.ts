import { z } from 'zod';

const commandSchema = z.string().trim().min(1);

/** Shape of `project.settings` (JSONB). Grows with later stages. */
export const projectSettingsSchema = z.object({
  commands: z
    .object({
      install: commandSchema.optional(),
      build: commandSchema.optional(),
      lint: commandSchema.optional(),
      test: commandSchema.optional(),
      coverage: commandSchema.optional(),
      dev: commandSchema.optional(),
    })
    .default({}),
});

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

const percentSchema = z.number().min(0).max(100);

/**
 * Shape of `project.testPolicy` (JSONB), see docs/architecture.md section 12.
 * Every field has a default, so `testPolicySchema.parse({})` yields the full policy.
 * Sections use `.prefault({})`: a missing section is parsed as `{}`, so the field defaults
 * below are the only place where default values are written.
 */
export const testPolicySchema = z.object({
  framework: z.enum(['auto', 'vitest', 'jest']).default('auto'),
  commands: z
    .object({
      test: commandSchema.default('pnpm test'),
      coverage: commandSchema.default('pnpm test --coverage --reporter=json'),
    })
    .prefault({}),
  coverageFormat: z.enum(['istanbul-json', 'lcov', 'cobertura']).default('istanbul-json'),
  changedLines: z
    .object({
      minLineCoverage: percentSchema.default(80),
      minBranchCoverage: percentSchema.nullable().default(null),
    })
    .prefault({}),
  global: z
    .object({
      failIfDropsBy: z.number().nonnegative().nullable().default(1),
    })
    .prefault({}),
  requiredTypes: z
    .object({
      unit: z.enum(['always', 'never']).default('always'),
      integration: z.enum(['always', 'on_api_change', 'never']).default('on_api_change'),
      e2e: z.enum(['always', 'on_acceptance_criteria', 'never']).default('on_acceptance_criteria'),
    })
    .prefault({}),
  testPaths: z.array(z.string().min(1)).default(['**/*.test.ts', '**/*.spec.ts', 'tests/**']),
  exclude: z.array(z.string().min(1)).default(['**/*.d.ts', 'src/generated/**']),
  audit: z
    .object({
      onEveryRun: z.boolean().default(true),
      scheduled: z.enum(['off', 'daily', 'weekly']).default('weekly'),
      allowDeleteTests: z.enum(['require_human', 'allow', 'never']).default('require_human'),
    })
    .prefault({}),
});

export type TestPolicy = z.infer<typeof testPolicySchema>;

/** Accepted input before defaults are applied (what callers may pass on write). */
export type ProjectSettingsInput = z.input<typeof projectSettingsSchema>;
export type TestPolicyInput = z.input<typeof testPolicySchema>;

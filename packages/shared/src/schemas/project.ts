import { z } from 'zod';

import { outputSchema } from './output.js';

const commandSchema = z.string().trim().min(1);

/** Shape of `project.settings` (JSONB). Grows with later stages. */
export const projectSettingsSchema = z
  .object({
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
  })
  .meta({ id: 'ProjectSettingsInput' });

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

const percentSchema = z.number().min(0).max(100);

/**
 * Shape of `project.testPolicy` (JSONB), see docs/architecture.md section 12.
 * Every field has a default, so `testPolicySchema.parse({})` yields the full policy.
 * Sections use `.prefault({})`: a missing section is parsed as `{}`, so the field defaults
 * below are the only place where default values are written.
 */
export const testPolicySchema = z
  .object({
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
        e2e: z
          .enum(['always', 'on_acceptance_criteria', 'never'])
          .default('on_acceptance_criteria'),
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
  })
  .meta({ id: 'TestPolicyInput' });

export type TestPolicy = z.infer<typeof testPolicySchema>;

/** Accepted input before defaults are applied (what callers may pass on write). */
export type ProjectSettingsInput = z.input<typeof projectSettingsSchema>;
export type TestPolicyInput = z.input<typeof testPolicySchema>;

/**
 * Body of `POST /projects`. Fields have no defaults here: the repository applies them,
 * so the same fields can be reused as an optional patch without resetting anything.
 */
export const createProjectSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(10_000).optional(),
    repoUrl: z
      .url({ protocol: /^https?$/ })
      .nullable()
      .optional(),
    defaultBranch: z.string().trim().min(1).max(255).optional(),
    settings: projectSettingsSchema.optional(),
    testPolicy: testPolicySchema.optional(),
  })
  .meta({ id: 'CreateProject' });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Body of `PATCH /projects/:id`: only the provided fields change. */
export const updateProjectSchema = createProjectSchema.partial().meta({ id: 'UpdateProject' });

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** A project as returned by the API. */
export const projectSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    repoUrl: z.string().nullable(),
    defaultBranch: z.string(),
    settings: outputSchema(projectSettingsSchema).meta({ id: 'ProjectSettings' }),
    testPolicy: outputSchema(testPolicySchema).meta({ id: 'TestPolicy' }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Project' });

export type ProjectDto = z.infer<typeof projectSchema>;

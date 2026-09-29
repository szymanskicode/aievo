import { z } from 'zod';

import { githubLoginSchema, githubRepoNameSchema } from './git.js';
import { outputSchema } from './output.js';

const commandSchema = z.string().trim().min(1);

/** Commands the platform runs in a project; each may be missing until someone sets it. */
export const projectCommandsSchema = z.object({
  install: commandSchema.optional(),
  build: commandSchema.optional(),
  lint: commandSchema.optional(),
  test: commandSchema.optional(),
  coverage: commandSchema.optional(),
  dev: commandSchema.optional(),
});

export type ProjectCommands = z.infer<typeof projectCommandsSchema>;

/** Commands proposed for an existing npm repository until stack detection exists (stage 4). */
export const DEFAULT_NPM_COMMANDS = {
  install: 'npm install',
  build: 'npm run build',
  lint: 'npm run lint',
  test: 'npm test',
  coverage: 'npm run test:coverage',
  dev: 'npm run dev',
} as const satisfies ProjectCommands;

/** Where the running app answers once `commands.dev` has started it. */
export const previewSchema = z.strictObject({
  port: z.int().min(1).max(65_535),
  readyPath: z.string().startsWith('/').default('/'),
});

export type Preview = z.infer<typeof previewSchema>;

/** Shape of `project.settings` (JSONB). Grows with later stages. */
export const projectSettingsSchema = z
  .object({
    commands: projectCommandsSchema.default({}),
    preview: previewSchema.optional(),
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

const projectNameSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().max(10_000);

/** Git refuses whitespace and these characters in branch names. */
const branchSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[^\s~^:?*[\\]+$/, 'Enter a valid branch name');

/** Which stored GitHub token to use; may be omitted when the workspace has exactly one. */
const credentialIdSchema = z.uuid().optional();

/**
 * Path A of the project wizard: connect a repository that already exists.
 * `name` defaults to the repository name.
 */
export const createExistingProjectSchema = z
  .strictObject({
    mode: z.literal('existing'),
    name: projectNameSchema.optional(),
    description: descriptionSchema.optional(),
    owner: githubLoginSchema,
    repo: githubRepoNameSchema,
    defaultBranch: branchSchema,
    commands: projectCommandsSchema.optional(),
    credentialId: credentialIdSchema,
  })
  .meta({ id: 'CreateExistingProject' });

export type CreateExistingProjectInput = z.infer<typeof createExistingProjectSchema>;

/** Path B of the project wizard: create a repository from a template. `name` names both. */
export const createNewProjectSchema = z
  .strictObject({
    mode: z.literal('new'),
    name: githubRepoNameSchema,
    // Also the GitHub repository description, which GitHub limits to 350 characters.
    description: z.string().max(350).optional(),
    owner: githubLoginSchema,
    private: z.boolean().default(true),
    template: z.string().trim().min(1).max(100),
    credentialId: credentialIdSchema,
  })
  .meta({ id: 'CreateNewProject' });

export type CreateNewProjectInput = z.infer<typeof createNewProjectSchema>;

/** Body of `POST /projects`: every project is linked to a GitHub repository. */
export const createProjectSchema = z
  .discriminatedUnion('mode', [createExistingProjectSchema, createNewProjectSchema])
  .meta({ id: 'CreateProject' });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Body of `PATCH /projects/:id`: only the provided fields change. The linked repository
 * is set by the wizard and cannot be changed here.
 */
export const updateProjectSchema = z
  .strictObject({
    name: projectNameSchema,
    description: descriptionSchema,
    defaultBranch: branchSchema,
    settings: projectSettingsSchema,
    testPolicy: testPolicySchema,
  })
  .partial()
  .meta({ id: 'UpdateProject' });

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** A project as returned by the API. */
export const projectSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    repoUrl: z.string().nullable(),
    /** Owner and name of the linked GitHub repository; both `null` when none is linked. */
    repoOwner: z.string().nullable(),
    repoName: z.string().nullable(),
    gitCredentialId: z.uuid().nullable(),
    defaultBranch: z.string(),
    settings: outputSchema(projectSettingsSchema).meta({ id: 'ProjectSettings' }),
    testPolicy: outputSchema(testPolicySchema).meta({ id: 'TestPolicy' }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Project' });

export type ProjectDto = z.infer<typeof projectSchema>;

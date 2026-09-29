import type { Schemas } from '@aievo/api-client';

const NOW = '2026-09-29T10:00:00.000Z';
let counter = 0;

/** A unique UUID-shaped id, readable in failure messages. */
export function fakeId(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

export function projectFixture(overrides: Partial<Schemas['Project']> = {}): Schemas['Project'] {
  return {
    id: fakeId(),
    name: 'Demo project',
    description: '',
    repoUrl: null,
    repoOwner: null,
    repoName: null,
    gitCredentialId: null,
    defaultBranch: 'main',
    settings: { commands: {} },
    testPolicy: {
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
      testPaths: ['**/*.test.ts'],
      exclude: [],
      audit: { onEveryRun: true, scheduled: 'weekly', allowDeleteTests: 'require_human' },
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function taskFixture(overrides: Partial<Schemas['Task']> = {}): Schemas['Task'] {
  return {
    id: fakeId(),
    projectId: fakeId(),
    title: 'A task',
    description: '',
    type: 'feature',
    priority: 'medium',
    status: 'draft',
    acceptanceCriteria: '',
    labels: [],
    position: 1,
    parentId: null,
    latestRun: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function providerFixture(overrides: Partial<Schemas['Provider']> = {}): Schemas['Provider'] {
  return {
    id: fakeId(),
    type: 'anthropic',
    label: 'Anthropic',
    hasKey: true,
    keyHint: 'abcd',
    baseUrl: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function modelFixture(overrides: Partial<Schemas['Model']> = {}): Schemas['Model'] {
  return {
    id: fakeId(),
    providerId: fakeId(),
    modelId: 'claude-sonnet-5-5',
    displayName: 'Claude Sonnet 5.5',
    capabilities: {
      tools: true,
      vision: true,
      structuredOutput: true,
      promptCaching: true,
      reasoning: false,
      contextWindow: 200_000,
      maxOutput: 64_000,
    },
    priceIn: null,
    priceOut: null,
    enabled: true,
    ...overrides,
  };
}

export function gitCredentialFixture(
  overrides: Partial<Schemas['GitCredential']> = {},
): Schemas['GitCredential'] {
  return {
    id: fakeId(),
    provider: 'github',
    label: 'GitHub',
    tokenHint: 'wxyz',
    githubLogin: 'octocat',
    expiresAt: '2026-12-31T00:00:00.000Z',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function githubRepoFixture(
  overrides: Partial<Schemas['GithubRepo']> = {},
): Schemas['GithubRepo'] {
  const owner = overrides.owner ?? 'octocat';
  const name = overrides.name ?? 'hello';
  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    private: true,
    defaultBranch: 'main',
    description: null,
    htmlUrl: `https://github.com/${owner}/${name}`,
    ...overrides,
  };
}

export function templateFixture(
  id: string,
  manifest: Partial<Schemas['TemplateManifest']> = {},
): Schemas['Template'] {
  return {
    id,
    manifest: {
      name: id,
      description: `The ${id} template`,
      commands: {},
      preview: null,
      services: [],
      testPolicy: {
        framework: 'auto',
        coverageFormat: 'istanbul-json',
        changedLines: { minLineCoverage: 80, minBranchCoverage: null },
        global: { failIfDropsBy: 1 },
        requiredTypes: {
          unit: 'always',
          integration: 'on_api_change',
          e2e: 'on_acceptance_criteria',
        },
        testPaths: ['**/*.test.ts'],
        exclude: [],
        audit: { onEveryRun: true, scheduled: 'weekly', allowDeleteTests: 'require_human' },
      },
      context: [],
      ...manifest,
    },
  };
}

export function setupStatusFixture(
  overrides: Partial<Schemas['SetupStatus']> = {},
): Schemas['SetupStatus'] {
  return { modelProvider: true, githubToken: true, project: true, ...overrides };
}

export function runFixture(overrides: Partial<Schemas['Run']> = {}): Schemas['Run'] {
  return {
    id: fakeId(),
    taskId: fakeId(),
    status: 'running',
    branch: 'agent/fix-login',
    prUrl: null,
    prNumber: null,
    costUsd: 0.1234,
    tokensIn: 12_000,
    tokensOut: 800,
    error: null,
    cancelRequestedAt: null,
    startedAt: NOW,
    endedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

export function toolCallFixture(overrides: Partial<Schemas['ToolCall']> = {}): Schemas['ToolCall'] {
  return {
    id: fakeId(),
    stepId: fakeId(),
    tool: 'read_file',
    args: { path: 'src/app.ts' },
    result: 'export const app = 1;',
    isError: false,
    durationMs: 12,
    exitCode: null,
    createdAt: NOW,
    ...overrides,
  };
}

export function stepFixture(overrides: Partial<Schemas['Step']> = {}): Schemas['Step'] {
  return {
    id: fakeId(),
    runId: fakeId(),
    stepKey: 'implement',
    agentKey: 'coder',
    iteration: 1,
    status: 'running',
    costUsd: 0.1,
    tokensIn: 10_000,
    tokensOut: 700,
    result: null,
    error: null,
    iterations: null,
    toolCallCount: 0,
    toolCalls: { items: [], nextCursor: null },
    startedAt: NOW,
    endedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

export function workspaceSettingsFixture(
  overrides: Partial<Schemas['WorkspaceSettings']['agentModels']> = {},
): Schemas['WorkspaceSettings'] {
  return { agentModels: { coder: '00000000-0000-4000-8000-00000000c0de', ...overrides } };
}

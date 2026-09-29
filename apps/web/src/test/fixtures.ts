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

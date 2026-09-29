import { describe, expect, it } from 'vitest';

import { agentPresetSchema, checkAgentModel, coderResultSchema } from './agent.js';
import { modelCapabilitiesSchema } from './model.js';

const preset = {
  key: 'coder',
  name: 'Programista',
  role: 'coder',
  runtime: 'native',
  requiredCapabilities: ['tools'],
  tools: ['read_file', 'write_file'],
  permissions: { write: ['**'] },
  limits: { maxIterations: 30 },
  result: 'coder-result@1',
};

describe('agentPresetSchema', () => {
  it('accepts a preset and fills defaults', () => {
    expect(agentPresetSchema.parse(preset)).toEqual({
      ...preset,
      permissions: { write: ['**'], existingTests: 'read-only' },
      params: {},
    });
  });

  it('rejects unknown tools, result schemas, capabilities and fields', () => {
    for (const change of [
      { tools: ['delete_repo'] },
      { result: 'nope@1' },
      { requiredCapabilities: ['contextWindow'] },
      { runtime: 'cli' },
      { extra: true },
      { key: 'Coder' },
      { tools: [] },
    ]) {
      expect(
        agentPresetSchema.safeParse({ ...preset, ...change }).success,
        JSON.stringify(change),
      ).toBe(false);
    }
  });

  it('allows a read-only agent', () => {
    const parsed = agentPresetSchema.parse({ ...preset, permissions: { write: null } });
    expect(parsed.permissions.write).toBeNull();
  });
});

describe('coderResultSchema', () => {
  const result = {
    summary: 'Added sum()',
    changedFiles: ['src/math.ts'],
    tests: { commands: ['npm test'], passed: true, summary: '3 passed' },
    openIssues: [],
  };

  it('accepts a complete result', () => {
    expect(coderResultSchema.parse(result)).toEqual(result);
  });

  it('requires a summary and the test report', () => {
    expect(coderResultSchema.safeParse({ ...result, summary: ' ' }).success).toBe(false);
    expect(coderResultSchema.safeParse({ ...result, tests: undefined }).success).toBe(false);
  });
});

describe('checkAgentModel', () => {
  const model = {
    enabled: true,
    capabilities: modelCapabilitiesSchema.parse({ tools: true }),
    priceIn: 3,
    priceOut: 15,
  };

  it('accepts an enabled, priced model with the required capabilities', () => {
    expect(checkAgentModel(model, ['tools'])).toBeNull();
  });

  it('explains why a model cannot be used', () => {
    expect(checkAgentModel({ ...model, enabled: false }, ['tools'])).toMatch(/disabled/);
    expect(checkAgentModel(model, ['tools', 'vision'])).toMatch(/capabilities: vision/);
    expect(checkAgentModel({ ...model, priceOut: null }, ['tools'])).toMatch(/pricing/);
  });
});

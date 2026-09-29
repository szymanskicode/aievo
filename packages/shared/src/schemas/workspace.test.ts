import { describe, expect, it } from 'vitest';

import {
  chosenAgentModel,
  updateWorkspaceSettingsSchema,
  workspaceLimitsSchema,
  workspaceSettingsSchema,
} from './workspace.js';

describe('workspace JSONB schemas', () => {
  it('fills limits with defaults', () => {
    expect(workspaceLimitsSchema.parse({})).toEqual({ monthlyBudgetUsd: null });
  });

  it('rejects a negative budget', () => {
    expect(workspaceLimitsSchema.safeParse({ monthlyBudgetUsd: -1 }).success).toBe(false);
  });

  it('fills empty settings with defaults', () => {
    expect(workspaceSettingsSchema.parse({})).toEqual({ agentModels: { coder: null } });
  });

  it('accepts a model id for an agent role', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(workspaceSettingsSchema.parse({ agentModels: { coder: id } }).agentModels.coder).toBe(
      id,
    );
    expect(workspaceSettingsSchema.safeParse({ agentModels: { coder: 'x' } }).success).toBe(false);
  });

  it('finds the model chosen for an agent', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const settings = workspaceSettingsSchema.parse({ agentModels: { coder: id } });

    expect(chosenAgentModel(settings, 'coder')).toBe(id);
    expect(chosenAgentModel(settings, 'inspector')).toBeNull();
    expect(chosenAgentModel(settings, 'toString')).toBeNull();
    expect(chosenAgentModel(workspaceSettingsSchema.parse({}), 'coder')).toBeNull();
  });

  it('accepts partial updates and refuses unknown fields', () => {
    expect(updateWorkspaceSettingsSchema.parse({})).toEqual({});
    expect(updateWorkspaceSettingsSchema.parse({ agentModels: { coder: null } })).toEqual({
      agentModels: { coder: null },
    });
    expect(updateWorkspaceSettingsSchema.safeParse({ theme: 'dark' }).success).toBe(false);
  });
});

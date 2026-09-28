import { describe, expect, it } from 'vitest';

import { workspaceLimitsSchema, workspaceSettingsSchema } from './workspace.js';

describe('workspace JSONB schemas', () => {
  it('fills limits with defaults', () => {
    expect(workspaceLimitsSchema.parse({})).toEqual({ monthlyBudgetUsd: null });
  });

  it('rejects a negative budget', () => {
    expect(workspaceLimitsSchema.safeParse({ monthlyBudgetUsd: -1 }).success).toBe(false);
  });

  it('accepts empty settings', () => {
    expect(workspaceSettingsSchema.parse({})).toEqual({});
  });
});

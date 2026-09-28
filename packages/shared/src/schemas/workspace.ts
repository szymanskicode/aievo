import { z } from 'zod';

/** Shape of `workspace.settings` (JSONB). Grows with later stages. */
export const workspaceSettingsSchema = z.object({});

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

/** Shape of `workspace.limits` (JSONB). `null` means "no limit". */
export const workspaceLimitsSchema = z.object({
  monthlyBudgetUsd: z.number().nonnegative().nullable().default(null),
});

export type WorkspaceLimits = z.infer<typeof workspaceLimitsSchema>;

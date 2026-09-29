import { z } from 'zod';

import { outputSchema } from './output.js';

/** Model each agent role uses by default ("default model per role", section 6). */
const agentModelsSchema = z.object({
  /** Model of the Programista agent; `null` until someone chooses one. */
  coder: z.uuid().nullable().default(null),
});

/** Shape of `workspace.settings` (JSONB). Grows with later stages. */
export const workspaceSettingsSchema = z.object({
  agentModels: agentModelsSchema.prefault({}),
});

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

/** The model chosen for the agent `agentKey`, or `null` when none is (or no setting exists). */
export function chosenAgentModel(settings: WorkspaceSettings, agentKey: string): string | null {
  const models: Record<string, string | null> = settings.agentModels;
  return Object.hasOwn(models, agentKey) ? (models[agentKey] ?? null) : null;
}

/** Body of `PATCH /workspace/settings`: only the provided fields change. */
export const updateWorkspaceSettingsSchema = z
  .strictObject({
    agentModels: z
      .strictObject({
        coder: z.uuid().nullable(),
      })
      .partial(),
  })
  .partial()
  .meta({ id: 'UpdateWorkspaceSettings' });

export type UpdateWorkspaceSettingsInput = z.infer<typeof updateWorkspaceSettingsSchema>;

/** Settings of the workspace as returned by the API. */
export const workspaceSettingsResponseSchema = outputSchema(workspaceSettingsSchema).meta({
  id: 'WorkspaceSettings',
});

/** Shape of `workspace.limits` (JSONB). `null` means "no limit". */
export const workspaceLimitsSchema = z.object({
  monthlyBudgetUsd: z.number().nonnegative().nullable().default(null),
});

export type WorkspaceLimits = z.infer<typeof workspaceLimitsSchema>;

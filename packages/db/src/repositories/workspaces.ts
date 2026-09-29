import { workspaceSettingsSchema } from '@aievo/shared';
import type { UpdateWorkspaceSettingsInput, WorkspaceSettings } from '@aievo/shared';
import { eq } from 'drizzle-orm';

import type { Db } from '../client.js';
import { workspace } from '../schema/index.js';

/**
 * Settings of the workspace with defaults filled in: rows written before a setting existed
 * lack it. Returns `null` when the workspace does not exist.
 */
export async function getWorkspaceSettings(
  db: Db,
  workspaceId: string,
): Promise<WorkspaceSettings | null> {
  const [row] = await db
    .select({ settings: workspace.settings })
    .from(workspace)
    .where(eq(workspace.id, workspaceId));
  return row ? workspaceSettingsSchema.parse(row.settings) : null;
}

/**
 * Changes only the provided settings and returns all of them; `null` when the workspace does
 * not exist. Whether a referenced model may be used is the caller's check.
 */
export async function updateWorkspaceSettings(
  db: Db,
  workspaceId: string,
  patch: UpdateWorkspaceSettingsInput,
): Promise<WorkspaceSettings | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ settings: workspace.settings })
      .from(workspace)
      .where(eq(workspace.id, workspaceId))
      .for('update');
    if (!row) return null;

    const current = workspaceSettingsSchema.parse(row.settings);
    const next = workspaceSettingsSchema.parse({
      ...current,
      agentModels: { ...current.agentModels, ...patch.agentModels },
    });
    await tx.update(workspace).set({ settings: next }).where(eq(workspace.id, workspaceId));
    return next;
  });
}

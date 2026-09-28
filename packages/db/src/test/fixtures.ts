import { workspaceLimitsSchema, workspaceSettingsSchema } from '@aievo/shared';

import type { Db } from '../client.js';
import { workspace } from '../schema/index.js';

export async function createWorkspace(db: Db, name = 'Test workspace'): Promise<string> {
  const [row] = await db
    .insert(workspace)
    .values({
      name,
      settings: workspaceSettingsSchema.parse({}),
      limits: workspaceLimitsSchema.parse({}),
    })
    .returning({ id: workspace.id });
  if (!row) throw new Error('Workspace insert returned no row');
  return row.id;
}

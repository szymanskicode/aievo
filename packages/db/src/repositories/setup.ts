import { and, eq, isNotNull } from 'drizzle-orm';

import type { Db } from '../client.js';
import { gitCredential, model, project } from '../schema/index.js';

export interface SetupStatus {
  modelProvider: boolean;
  githubToken: boolean;
  project: boolean;
}

/**
 * The first-run checklist of a workspace, derived from its data on every call.
 * A project counts only when it is linked to a repository, so the seeded example
 * project does not make a fresh instance look configured.
 */
export async function getSetupStatus(db: Db, workspaceId: string): Promise<SetupStatus> {
  const [enabledModels, credentials, linkedProjects] = await Promise.all([
    db
      .select({ id: model.id })
      .from(model)
      .where(and(eq(model.workspaceId, workspaceId), eq(model.enabled, true)))
      .limit(1),
    db
      .select({ id: gitCredential.id })
      .from(gitCredential)
      .where(eq(gitCredential.workspaceId, workspaceId))
      .limit(1),
    db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.workspaceId, workspaceId), isNotNull(project.repoOwner)))
      .limit(1),
  ]);
  return {
    modelProvider: enabledModels.length > 0,
    githubToken: credentials.length > 0,
    project: linkedProjects.length > 0,
  };
}

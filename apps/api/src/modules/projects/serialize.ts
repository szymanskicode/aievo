import type { Project } from '@aievo/db';
import type { ProjectDto } from '@aievo/shared';

/** Maps a database row to the API contract; `workspaceId` stays server-side. */
export function serializeProject(row: Project): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    repoUrl: row.repoUrl,
    repoOwner: row.repoOwner,
    repoName: row.repoName,
    gitCredentialId: row.gitCredentialId,
    defaultBranch: row.defaultBranch,
    settings: row.settings,
    testPolicy: row.testPolicy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

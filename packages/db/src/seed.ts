import {
  projectSettingsSchema,
  testPolicySchema,
  workspaceLimitsSchema,
  workspaceSettingsSchema,
} from '@aievo/shared';

import type { Db } from './client.js';
import { membership, project, task, user, workspace } from './schema/index.js';

// Fixed ids make the seed idempotent and let the API resolve the default workspace.
export const DEFAULT_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000002';
export const SEED_PROJECT_ID = '00000000-0000-4000-8000-000000000003';

const seedTasks = [
  {
    id: '00000000-0000-4000-8000-000000000011',
    title: 'Show task details in a side panel',
    description: 'Clicking a card on the board opens its details without leaving the board.',
    type: 'feature',
    priority: 'medium',
    status: 'draft',
    acceptanceCriteria: 'The panel shows title, description, status and labels.',
    labels: ['ui'],
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    title: 'Board loses card order after refresh',
    description: 'Reordered cards jump back to their previous position after a reload.',
    type: 'bug',
    priority: 'high',
    status: 'ready',
    acceptanceCriteria: 'Card order is preserved across reloads.',
    labels: ['ui', 'board'],
  },
  {
    id: '00000000-0000-4000-8000-000000000013',
    title: 'Set up the monorepo',
    description: 'pnpm workspaces, Turborepo, TypeScript, lint and tests.',
    type: 'chore',
    priority: 'low',
    status: 'done',
    acceptanceCriteria: 'typecheck, lint and test pass.',
    labels: ['infra'],
  },
] as const;

/** Inserts the default data. Safe to run repeatedly: existing rows are left untouched. */
export async function seed(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(workspace)
      .values({
        id: DEFAULT_WORKSPACE_ID,
        name: 'Default',
        settings: workspaceSettingsSchema.parse({}),
        limits: workspaceLimitsSchema.parse({}),
      })
      .onConflictDoNothing();

    await tx
      .insert(user)
      .values({ id: LOCAL_USER_ID, email: null, displayName: 'Local user' })
      .onConflictDoNothing();

    await tx
      .insert(membership)
      .values({ workspaceId: DEFAULT_WORKSPACE_ID, userId: LOCAL_USER_ID, role: 'owner' })
      .onConflictDoNothing();

    await tx
      .insert(project)
      .values({
        id: SEED_PROJECT_ID,
        workspaceId: DEFAULT_WORKSPACE_ID,
        name: 'AIEvo',
        description: 'AIEvo develops AIEvo.',
        settings: projectSettingsSchema.parse({}),
        testPolicy: testPolicySchema.parse({}),
      })
      .onConflictDoNothing();

    await tx
      .insert(task)
      .values(
        seedTasks.map((t, index) => ({
          ...t,
          labels: [...t.labels],
          projectId: SEED_PROJECT_ID,
          position: index + 1,
        })),
      )
      .onConflictDoNothing();
  });
}

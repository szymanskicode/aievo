import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { workspace } from '../schema/index.js';
import { closeTestDb, getTestDb, resetDb } from '../test/db.js';
import { createWorkspace } from '../test/fixtures.js';
import { getWorkspaceSettings, updateWorkspaceSettings } from './workspaces.js';

const db = getTestDb();
let workspaceId: string;
let otherWorkspaceId: string;

beforeEach(async () => {
  await resetDb(db);
  workspaceId = await createWorkspace(db);
  otherWorkspaceId = await createWorkspace(db, 'Other');
});

afterAll(closeTestDb);

describe('workspace settings', () => {
  it('fills in defaults for settings stored before they existed', async () => {
    const [row] = await db
      .insert(workspace)
      .values({ name: 'Old', settings: {} as never, limits: { monthlyBudgetUsd: null } })
      .returning({ id: workspace.id });

    expect(await getWorkspaceSettings(db, row!.id)).toEqual({ agentModels: { coder: null } });
  });

  it('changes only the given settings of one workspace', async () => {
    const modelId = randomUUID();

    expect(
      await updateWorkspaceSettings(db, workspaceId, { agentModels: { coder: modelId } }),
    ).toEqual({ agentModels: { coder: modelId } });
    expect(await updateWorkspaceSettings(db, workspaceId, {})).toEqual({
      agentModels: { coder: modelId },
    });
    expect(await getWorkspaceSettings(db, otherWorkspaceId)).toEqual({
      agentModels: { coder: null },
    });

    await updateWorkspaceSettings(db, workspaceId, { agentModels: { coder: null } });
    expect(await getWorkspaceSettings(db, workspaceId)).toEqual({ agentModels: { coder: null } });
  });

  it('returns null for a missing workspace', async () => {
    expect(await getWorkspaceSettings(db, randomUUID())).toBeNull();
    expect(await updateWorkspaceSettings(db, randomUUID(), {})).toBeNull();
  });
});

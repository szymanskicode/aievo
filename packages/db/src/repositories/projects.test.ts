import { ZodError } from 'zod';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, resetDb } from '../test/db.js';
import { createWorkspace } from '../test/fixtures.js';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from './projects.js';

const db = getTestDb();
let workspaceId: string;

beforeEach(async () => {
  await resetDb(db);
  workspaceId = await createWorkspace(db);
});

afterAll(closeTestDb);

describe('project repository', () => {
  it('creates a project with defaults', async () => {
    const created = await createProject(db, workspaceId, { name: 'Demo' });

    expect(created).toMatchObject({
      workspaceId,
      name: 'Demo',
      description: '',
      repoUrl: null,
      defaultBranch: 'main',
      settings: { commands: {} },
    });
    expect(created.testPolicy.changedLines.minLineCoverage).toBe(80);
    expect(await getProject(db, workspaceId, created.id)).toEqual(created);
  });

  it('lists projects of the workspace', async () => {
    await createProject(db, workspaceId, { name: 'A' });
    await createProject(db, workspaceId, { name: 'B' });

    const names = (await listProjects(db, workspaceId)).map((p) => p.name);
    expect(names).toEqual(['A', 'B']);
  });

  it('updates fields and bumps updatedAt', async () => {
    const created = await createProject(db, workspaceId, { name: 'Demo' });

    const updated = await updateProject(db, workspaceId, created.id, {
      name: 'Renamed',
      testPolicy: { changedLines: { minLineCoverage: 95 } },
    });

    expect(updated?.name).toBe('Renamed');
    expect(updated?.testPolicy.changedLines.minLineCoverage).toBe(95);
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
  });

  it('returns the project unchanged for an empty patch', async () => {
    const created = await createProject(db, workspaceId, { name: 'Demo' });
    expect(await updateProject(db, workspaceId, created.id, {})).toEqual(created);
  });

  it('rejects invalid JSONB on create and update', async () => {
    await expect(
      createProject(db, workspaceId, {
        name: 'Bad',
        testPolicy: { changedLines: { minLineCoverage: 150 } },
      }),
    ).rejects.toBeInstanceOf(ZodError);

    const created = await createProject(db, workspaceId, { name: 'Demo' });
    await expect(
      updateProject(db, workspaceId, created.id, { settings: { commands: { test: '' } } }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('deletes a project', async () => {
    const created = await createProject(db, workspaceId, { name: 'Demo' });

    expect(await deleteProject(db, workspaceId, created.id)).toBe(true);
    expect(await getProject(db, workspaceId, created.id)).toBeNull();
    expect(await deleteProject(db, workspaceId, created.id)).toBe(false);
  });
});

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { listProjects } from './repositories/projects.js';
import { listTasks, updateTask } from './repositories/tasks.js';
import { membership, project, task, user, workspace } from './schema/index.js';
import { DEFAULT_WORKSPACE_ID, LOCAL_USER_ID, SEED_PROJECT_ID, seed } from './seed.js';
import { closeTestDb, getTestDb, resetDb } from './test/db.js';

const db = getTestDb();

beforeEach(async () => {
  await resetDb(db);
});

afterAll(closeTestDb);

async function counts() {
  return {
    workspaces: await db.$count(workspace),
    users: await db.$count(user),
    memberships: await db.$count(membership),
    projects: await db.$count(project),
    tasks: await db.$count(task),
  };
}

describe('seed', () => {
  it('creates the default workspace, owner, project and tasks', async () => {
    await seed(db);

    expect(await counts()).toEqual({
      workspaces: 1,
      users: 1,
      memberships: 1,
      projects: 1,
      tasks: 3,
    });
    const [owner] = await db.select().from(membership);
    expect(owner).toEqual({
      workspaceId: DEFAULT_WORKSPACE_ID,
      userId: LOCAL_USER_ID,
      role: 'owner',
    });

    const projects = await listProjects(db, DEFAULT_WORKSPACE_ID);
    expect(projects.map((p) => p.name)).toEqual(['AIEvo']);
  });

  it('is idempotent', async () => {
    await seed(db);
    await seed(db);

    expect(await counts()).toEqual({
      workspaces: 1,
      users: 1,
      memberships: 1,
      projects: 1,
      tasks: 3,
    });
  });

  it('does not overwrite changes made after seeding', async () => {
    await seed(db);
    const [first] = await listTasks(db, DEFAULT_WORKSPACE_ID, { projectId: SEED_PROJECT_ID });
    await updateTask(db, DEFAULT_WORKSPACE_ID, first!.id, { title: 'Edited by user' });

    await seed(db);

    const [again] = await listTasks(db, DEFAULT_WORKSPACE_ID, { projectId: SEED_PROJECT_ID });
    expect(again?.title).toBe('Edited by user');
  });
});

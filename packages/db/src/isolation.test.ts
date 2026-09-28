import { modelCapabilitiesSchema } from '@aievo/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from './repositories/projects.js';
import type { Project } from './repositories/projects.js';
import { createTask, deleteTask, getTask, listTasks, updateTask } from './repositories/tasks.js';
import type { Task } from './repositories/tasks.js';
import { model, providerCredential } from './schema/index.js';
import { closeTestDb, getTestDb, resetDb } from './test/db.js';
import { createWorkspace } from './test/fixtures.js';

const db = getTestDb();
let ownerId: string;
let strangerId: string;
let ownProject: Project;
let ownTask: Task;

beforeEach(async () => {
  await resetDb(db);
  ownerId = await createWorkspace(db, 'Owner');
  strangerId = await createWorkspace(db, 'Stranger');
  ownProject = await createProject(db, ownerId, { name: 'Private' });
  const task = await createTask(db, ownerId, ownProject.id, { title: 'Secret task' });
  if (!task) throw new Error('Task was not created');
  ownTask = task;
});

afterAll(closeTestDb);

describe('workspace isolation', () => {
  it('hides projects from another workspace', async () => {
    expect(await listProjects(db, strangerId)).toEqual([]);
    expect(await getProject(db, strangerId, ownProject.id)).toBeNull();
    expect(await updateProject(db, strangerId, ownProject.id, { name: 'Hacked' })).toBeNull();
    expect(await deleteProject(db, strangerId, ownProject.id)).toBe(false);

    expect(await getProject(db, ownerId, ownProject.id)).toEqual(ownProject);
  });

  it('hides tasks from another workspace', async () => {
    expect(await listTasks(db, strangerId, { projectId: ownProject.id })).toEqual([]);
    expect(await getTask(db, strangerId, ownTask.id)).toBeNull();
    expect(await updateTask(db, strangerId, ownTask.id, { title: 'Hacked' })).toBeNull();
    expect(await deleteTask(db, strangerId, ownTask.id)).toBe(false);

    expect(await getTask(db, ownerId, ownTask.id)).toEqual(ownTask);
  });

  it('refuses to create a task in another workspace project', async () => {
    expect(await createTask(db, strangerId, ownProject.id, { title: 'Intruder' })).toBeNull();
    expect(await listTasks(db, ownerId, { projectId: ownProject.id })).toHaveLength(1);
  });

  it('prevents a model from pointing at another workspace provider', async () => {
    const [provider] = await db
      .insert(providerCredential)
      .values({
        workspaceId: ownerId,
        type: 'openai-compatible',
        label: 'Local',
        encryptedKey: 'not-a-real-ciphertext',
        keyHint: 'abcd',
      })
      .returning();

    await expect(
      db.insert(model).values({
        workspaceId: strangerId,
        providerId: provider!.id,
        modelId: 'some-model',
        displayName: 'Some model',
        capabilities: modelCapabilitiesSchema.parse({}),
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });
});

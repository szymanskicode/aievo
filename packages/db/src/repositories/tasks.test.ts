import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { InvalidReferenceError } from '../errors.js';
import { closeTestDb, getTestDb, resetDb } from '../test/db.js';
import { createWorkspace } from '../test/fixtures.js';
import { createProject, deleteProject } from './projects.js';
import { createTask, deleteTask, getTask, listTasks, updateTask } from './tasks.js';
import type { NewTaskInput } from './tasks.js';

const db = getTestDb();
let workspaceId: string;
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  workspaceId = await createWorkspace(db);
  projectId = (await createProject(db, workspaceId, { name: 'Demo' })).id;
});

afterAll(closeTestDb);

async function mustCreate(title: string, rest: Omit<NewTaskInput, 'title'> = {}) {
  const created = await createTask(db, workspaceId, projectId, { ...rest, title });
  if (!created) throw new Error('Task was not created');
  return created;
}

describe('task repository', () => {
  it('creates a task with defaults', async () => {
    const created = await mustCreate('First');

    expect(created).toMatchObject({
      projectId,
      title: 'First',
      description: '',
      type: 'feature',
      priority: 'medium',
      status: 'draft',
      acceptanceCriteria: '',
      labels: [],
      position: 1,
      parentId: null,
    });
    expect(await getTask(db, workspaceId, created.id)).toEqual(created);
  });

  it('appends new tasks at the end of the project', async () => {
    await mustCreate('A');
    await mustCreate('B', { position: 10 });
    const c = await mustCreate('C');

    expect(c.position).toBe(11);
  });

  it('lists tasks ordered by position and filtered by status', async () => {
    await mustCreate('Late', { position: 5, status: 'ready' });
    await mustCreate('Early', { position: 1, status: 'ready' });
    await mustCreate('Other', { position: 3, status: 'done' });

    const all = await listTasks(db, workspaceId, { projectId });
    expect(all.map((t) => t.title)).toEqual(['Early', 'Other', 'Late']);

    const ready = await listTasks(db, workspaceId, { projectId, status: 'ready' });
    expect(ready.map((t) => t.title)).toEqual(['Early', 'Late']);
  });

  it('updates fields and bumps updatedAt', async () => {
    const created = await mustCreate('Task');

    const updated = await updateTask(db, workspaceId, created.id, {
      status: 'in_review',
      labels: ['api', 'db'],
      position: 2.5,
    });

    expect(updated).toMatchObject({ status: 'in_review', labels: ['api', 'db'], position: 2.5 });
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
  });

  it('deletes a task', async () => {
    const created = await mustCreate('Task');

    expect(await deleteTask(db, workspaceId, created.id)).toBe(true);
    expect(await getTask(db, workspaceId, created.id)).toBeNull();
    expect(await deleteTask(db, workspaceId, created.id)).toBe(false);
  });

  it('returns null when creating in a missing project', async () => {
    const missing = '00000000-0000-4000-8000-00000000ffff';
    expect(await createTask(db, workspaceId, missing, { title: 'X' })).toBeNull();
  });

  describe('subtasks', () => {
    it('links a subtask to its parent', async () => {
      const parent = await mustCreate('Parent');
      const child = await mustCreate('Child', { parentId: parent.id });

      expect(child.parentId).toBe(parent.id);
    });

    it('rejects a parent from another project', async () => {
      const otherProject = await createProject(db, workspaceId, { name: 'Other' });
      const foreign = await createTask(db, workspaceId, otherProject.id, { title: 'Foreign' });

      await expect(
        createTask(db, workspaceId, projectId, { title: 'Child', parentId: foreign!.id }),
      ).rejects.toBeInstanceOf(InvalidReferenceError);
    });

    it('rejects a task as its own parent', async () => {
      const created = await mustCreate('Task');

      await expect(
        updateTask(db, workspaceId, created.id, { parentId: created.id }),
      ).rejects.toBeInstanceOf(InvalidReferenceError);
    });

    it('rejects moving a task under its own descendant', async () => {
      const root = await mustCreate('Root');
      const child = await mustCreate('Child', { parentId: root.id });
      const grandchild = await mustCreate('Grandchild', { parentId: child.id });

      await expect(
        updateTask(db, workspaceId, root.id, { parentId: grandchild.id }),
      ).rejects.toBeInstanceOf(InvalidReferenceError);
      expect((await getTask(db, workspaceId, root.id))?.parentId).toBeNull();
    });

    it('allows moving a subtask to another branch of the tree', async () => {
      const root = await mustCreate('Root');
      const left = await mustCreate('Left', { parentId: root.id });
      const right = await mustCreate('Right', { parentId: root.id });
      const leaf = await mustCreate('Leaf', { parentId: left.id });

      const moved = await updateTask(db, workspaceId, leaf.id, { parentId: right.id });

      expect(moved?.parentId).toBe(right.id);
    });

    it('keeps subtasks when the parent is deleted', async () => {
      const parent = await mustCreate('Parent');
      const child = await mustCreate('Child', { parentId: parent.id });

      await deleteTask(db, workspaceId, parent.id);

      expect((await getTask(db, workspaceId, child.id))?.parentId).toBeNull();
    });
  });

  it('deletes tasks together with their project', async () => {
    const created = await mustCreate('Task');

    await deleteProject(db, workspaceId, projectId);

    expect(await getTask(db, workspaceId, created.id)).toBeNull();
  });
});

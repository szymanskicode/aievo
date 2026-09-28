import { createProject, createTask } from '@aievo/db';
import type { Db, Project, Task } from '@aievo/db';
import { createWorkspace, getTestDb, resetDb } from '@aievo/db/testing';
import type { Express } from 'express';

import { createApp } from '../app.js';

export const MISSING_ID = '00000000-0000-4000-8000-00000000dead';

export interface TestContext {
  db: Db;
  /** App bound to the caller's own workspace. */
  app: Express;
  workspaceId: string;
  /** A second workspace whose data must stay invisible to `app`. */
  otherWorkspaceId: string;
}

/** Empties the database and returns an app bound to a fresh workspace. */
export async function setupTestApp(): Promise<TestContext> {
  const db = getTestDb();
  await resetDb(db);
  const workspaceId = await createWorkspace(db, 'Own');
  const otherWorkspaceId = await createWorkspace(db, 'Other');
  const app = createApp({ db, resolveWorkspace: () => workspaceId });
  return { db, app, workspaceId, otherWorkspaceId };
}

export async function insertProject(db: Db, workspaceId: string, name = 'Demo'): Promise<Project> {
  return createProject(db, workspaceId, { name });
}

export async function insertTask(
  db: Db,
  workspaceId: string,
  projectId: string,
  title = 'Task',
): Promise<Task> {
  const task = await createTask(db, workspaceId, projectId, { title });
  if (!task) throw new Error('Task was not created');
  return task;
}

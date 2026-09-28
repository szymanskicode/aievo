import { projectSettingsSchema, testPolicySchema } from '@aievo/shared';
import type { ProjectSettingsInput, TestPolicyInput } from '@aievo/shared';
import { and, asc, eq } from 'drizzle-orm';

import type { Db } from '../client.js';
import { project } from '../schema/index.js';

export type Project = typeof project.$inferSelect;

export interface NewProjectInput {
  name: string;
  description?: string;
  repoUrl?: string | null;
  defaultBranch?: string;
  settings?: ProjectSettingsInput;
  testPolicy?: TestPolicyInput;
}

export type ProjectPatch = Partial<NewProjectInput>;

const inWorkspace = (workspaceId: string, id: string) =>
  and(eq(project.workspaceId, workspaceId), eq(project.id, id));

export async function listProjects(db: Db, workspaceId: string): Promise<Project[]> {
  return db
    .select()
    .from(project)
    .where(eq(project.workspaceId, workspaceId))
    .orderBy(asc(project.createdAt), asc(project.name));
}

export async function getProject(db: Db, workspaceId: string, id: string): Promise<Project | null> {
  const [row] = await db.select().from(project).where(inWorkspace(workspaceId, id));
  return row ?? null;
}

export async function createProject(
  db: Db,
  workspaceId: string,
  input: NewProjectInput,
): Promise<Project> {
  const [row] = await db
    .insert(project)
    .values({
      workspaceId,
      name: input.name,
      description: input.description ?? '',
      repoUrl: input.repoUrl ?? null,
      defaultBranch: input.defaultBranch ?? 'main',
      settings: projectSettingsSchema.parse(input.settings ?? {}),
      testPolicy: testPolicySchema.parse(input.testPolicy ?? {}),
    })
    .returning();
  if (!row) throw new Error('Project insert returned no row');
  return row;
}

/** Returns `null` when the project does not exist in the workspace. */
export async function updateProject(
  db: Db,
  workspaceId: string,
  id: string,
  patch: ProjectPatch,
): Promise<Project | null> {
  const values: Partial<typeof project.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.repoUrl !== undefined) values.repoUrl = patch.repoUrl;
  if (patch.defaultBranch !== undefined) values.defaultBranch = patch.defaultBranch;
  if (patch.settings !== undefined) values.settings = projectSettingsSchema.parse(patch.settings);
  if (patch.testPolicy !== undefined) values.testPolicy = testPolicySchema.parse(patch.testPolicy);

  if (Object.keys(values).length === 0) return getProject(db, workspaceId, id);

  const [row] = await db
    .update(project)
    .set(values)
    .where(inWorkspace(workspaceId, id))
    .returning();
  return row ?? null;
}

export async function deleteProject(db: Db, workspaceId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(project)
    .where(inWorkspace(workspaceId, id))
    .returning({ id: project.id });
  return rows.length > 0;
}

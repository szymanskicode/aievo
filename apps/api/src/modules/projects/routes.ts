import {
  createTask,
  deleteProject,
  getProject,
  listProjects,
  listTasks,
  updateProject,
} from '@aievo/db';
import {
  createProjectSchema,
  createTaskSchema,
  idParamsSchema,
  projectSchema,
  taskListQuerySchema,
  taskSchema,
  updateProjectSchema,
  withoutUndefined,
} from '@aievo/shared';
import { z } from 'zod';

import { GIT_ERROR_STATUSES, resourceNotFound } from '../../errors.js';
import { defineRoute } from '../../http/route.js';
import { serializeTask, serializeTasks } from '../tasks/serialize.js';
import { createProjectWithRepo } from './create-project.js';
import { serializeProject } from './serialize.js';

const tag = 'projects';

export const projectRoutes = [
  defineRoute(
    {
      method: 'get',
      path: '/projects',
      summary: 'List projects',
      tag,
      status: 200,
      response: z.array(projectSchema),
    },
    async ({ db, workspaceId }) => (await listProjects(db, workspaceId)).map(serializeProject),
  ),

  defineRoute(
    {
      method: 'post',
      path: '/projects',
      summary: 'Create a project from an existing GitHub repository or a new one from a template',
      tag,
      body: createProjectSchema,
      status: 201,
      response: projectSchema,
      // 409: no token, a token that cannot be decrypted or a repository name already taken;
      // `project_setup_failed` keeps the status of the step that failed.
      errors: [409, 500, ...GIT_ERROR_STATUSES],
    },
    async (ctx) => serializeProject(await createProjectWithRepo(ctx, ctx.workspaceId, ctx.body)),
  ),

  defineRoute(
    {
      method: 'get',
      path: '/projects/:id',
      summary: 'Get a project',
      tag,
      params: idParamsSchema,
      status: 200,
      response: projectSchema,
      errors: [404],
    },
    async ({ db, workspaceId, params }) => {
      const row = await getProject(db, workspaceId, params.id);
      if (!row) throw resourceNotFound('Project');
      return serializeProject(row);
    },
  ),

  defineRoute(
    {
      method: 'patch',
      path: '/projects/:id',
      summary: 'Update a project',
      tag,
      params: idParamsSchema,
      body: updateProjectSchema,
      status: 200,
      response: projectSchema,
      errors: [404],
    },
    async ({ db, workspaceId, params, body }) => {
      const row = await updateProject(db, workspaceId, params.id, withoutUndefined(body));
      if (!row) throw resourceNotFound('Project');
      return serializeProject(row);
    },
  ),

  defineRoute(
    {
      method: 'delete',
      path: '/projects/:id',
      summary: 'Delete a project and its tasks',
      tag,
      params: idParamsSchema,
      status: 204,
      errors: [404],
    },
    async ({ db, workspaceId, params }) => {
      if (!(await deleteProject(db, workspaceId, params.id))) throw resourceNotFound('Project');
    },
  ),

  defineRoute(
    {
      method: 'get',
      path: '/projects/:id/tasks',
      // Grouped with the other task operations in the OpenAPI document and client.
      tag: 'tasks',
      summary: 'List tasks of a project in board order',
      params: idParamsSchema,
      query: taskListQuerySchema,
      status: 200,
      response: z.array(taskSchema),
      errors: [404],
    },
    async ({ db, workspaceId, params, query }) => {
      // An empty list must not hide that the project is missing or belongs elsewhere.
      if (!(await getProject(db, workspaceId, params.id))) throw resourceNotFound('Project');
      const rows = await listTasks(db, workspaceId, {
        projectId: params.id,
        ...withoutUndefined(query),
      });
      return serializeTasks(db, workspaceId, rows);
    },
  ),

  defineRoute(
    {
      method: 'post',
      path: '/projects/:id/tasks',
      // Grouped with the other task operations in the OpenAPI document and client.
      tag: 'tasks',
      summary: 'Create a task in a project',
      params: idParamsSchema,
      body: createTaskSchema,
      status: 201,
      response: taskSchema,
      errors: [404],
    },
    async ({ db, workspaceId, params, body }) => {
      const row = await createTask(db, workspaceId, params.id, withoutUndefined(body));
      if (!row) throw resourceNotFound('Project');
      // A new task has never run.
      return serializeTask(row, null);
    },
  ),
];

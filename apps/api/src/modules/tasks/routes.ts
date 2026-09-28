import { deleteTask, getTask, updateTask } from '@aievo/db';
import { idParamsSchema, taskSchema, updateTaskSchema } from '@aievo/shared';

import { resourceNotFound } from '../../errors.js';
import { defineRoute } from '../../http/route.js';
import { withoutUndefined } from '../../http/without-undefined.js';
import { serializeTask } from './serialize.js';

const tag = 'tasks';

export const taskRoutes = [
  defineRoute(
    {
      method: 'get',
      path: '/tasks/:id',
      summary: 'Get a task',
      tag,
      params: idParamsSchema,
      status: 200,
      response: taskSchema,
      errors: [404],
    },
    async ({ db, workspaceId, params }) => {
      const row = await getTask(db, workspaceId, params.id);
      if (!row) throw resourceNotFound('Task');
      return serializeTask(row);
    },
  ),

  defineRoute(
    {
      method: 'patch',
      path: '/tasks/:id',
      summary: 'Update a task, including its status and position on the board',
      tag,
      params: idParamsSchema,
      body: updateTaskSchema,
      status: 200,
      response: taskSchema,
      errors: [404],
    },
    async ({ db, workspaceId, params, body }) => {
      const row = await updateTask(db, workspaceId, params.id, withoutUndefined(body));
      if (!row) throw resourceNotFound('Task');
      return serializeTask(row);
    },
  ),

  defineRoute(
    {
      method: 'delete',
      path: '/tasks/:id',
      summary: 'Delete a task; its subtasks become top-level tasks',
      tag,
      params: idParamsSchema,
      status: 204,
      errors: [404],
    },
    async ({ db, workspaceId, params }) => {
      if (!(await deleteTask(db, workspaceId, params.id))) throw resourceNotFound('Task');
    },
  ),
];

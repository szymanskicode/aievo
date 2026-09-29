import {
  DuplicateRowError,
  createRun,
  finishRun,
  getProject,
  getRun,
  getTask,
  listTaskRuns,
  requestRunCancel,
} from '@aievo/db';
import { idParamsSchema, runSchema } from '@aievo/shared';
import { z } from 'zod';

import { ApiError, resourceNotFound } from '../../errors.js';
import { defineRoute } from '../../http/route.js';
import { serializeRun } from './serialize.js';

const tag = 'runs';

export const runRoutes = [
  defineRoute(
    {
      method: 'post',
      path: '/tasks/:id/runs',
      summary: 'Start a run of a task; the worker picks it up from the queue',
      tag,
      params: idParamsSchema,
      status: 201,
      response: runSchema,
      errors: [404, 409, 503],
    },
    async ({ db, queue, workspaceId, params }) => {
      const task = await getTask(db, workspaceId, params.id);
      if (!task) throw resourceNotFound('Task');
      const project = await getProject(db, workspaceId, task.projectId);
      if (!project) throw resourceNotFound('Project');
      if (!project.repoOwner || !project.repoName || !project.gitCredentialId) {
        throw new ApiError(
          409,
          'project_not_linked',
          'The project has no GitHub repository or token to run tasks against',
        );
      }
      if (!project.settings.commands.test) {
        throw new ApiError(
          409,
          'test_command_missing',
          'Set the test command of the project first',
        );
      }

      const run = await createRun(db, workspaceId, task.id).catch((error: unknown) => {
        if (error instanceof DuplicateRowError) {
          throw new ApiError(
            409,
            'run_already_active',
            'The task already has a queued or active run',
          );
        }
        throw error;
      });
      if (!run) throw resourceNotFound('Task');

      try {
        await queue.enqueueRun(run.id);
      } catch (error) {
        // A run that no worker will ever see must not stay queued forever.
        await finishRun(db, workspaceId, run.id, {
          status: 'failed',
          error: { code: 'queue_unavailable', message: 'The run could not be queued' },
        });
        if (error instanceof ApiError) throw error;
        throw new ApiError(503, 'queue_unavailable', 'The run could not be queued');
      }
      return serializeRun(run);
    },
  ),

  defineRoute(
    {
      method: 'get',
      path: '/tasks/:id/runs',
      summary: 'List runs of a task, newest first',
      tag,
      params: idParamsSchema,
      status: 200,
      response: z.array(runSchema),
      errors: [404],
    },
    async ({ db, workspaceId, params }) => {
      if (!(await getTask(db, workspaceId, params.id))) throw resourceNotFound('Task');
      const rows = await listTaskRuns(db, workspaceId, params.id);
      return rows.map(serializeRun);
    },
  ),

  defineRoute(
    {
      method: 'get',
      path: '/runs/:id',
      summary: 'Get a run',
      tag,
      params: idParamsSchema,
      status: 200,
      response: runSchema,
      errors: [404],
    },
    async ({ db, workspaceId, params }) => {
      const row = await getRun(db, workspaceId, params.id);
      if (!row) throw resourceNotFound('Run');
      return serializeRun(row);
    },
  ),

  defineRoute(
    {
      method: 'post',
      path: '/runs/:id/cancel',
      summary:
        'Cancel a run. A queued run is cancelled at once; an active run gets `cancelRequestedAt` ' +
        'and the worker stops it shortly after.',
      tag,
      params: idParamsSchema,
      status: 200,
      response: runSchema,
      errors: [404, 409],
    },
    async ({ db, workspaceId, params }) => {
      const result = await requestRunCancel(db, workspaceId, params.id);
      if (!result) throw resourceNotFound('Run');
      if (result.outcome === 'final') {
        throw new ApiError(409, 'run_not_active', 'The run has already finished');
      }
      return serializeRun(result.run);
    },
  ),
];

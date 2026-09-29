import { z } from 'zod';

import { taskPrioritySchema, taskStatusSchema, taskTypeSchema } from './enums.js';
import { runSummarySchema } from './run.js';

/**
 * Body of `POST /projects/:id/tasks`. Fields have no defaults here: the repository
 * applies them, so the same fields can be reused as an optional patch.
 */
export const createTaskSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(50_000).optional(),
    type: taskTypeSchema.optional(),
    priority: taskPrioritySchema.optional(),
    status: taskStatusSchema.optional(),
    acceptanceCriteria: z.string().max(50_000).optional(),
    labels: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
    // Float, so a card can be dropped between two others without renumbering.
    position: z.number().optional(),
    parentId: z.uuid().nullable().optional(),
  })
  .meta({ id: 'CreateTask' });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Body of `PATCH /tasks/:id`, including moves on the board (`status`, `position`). */
export const updateTaskSchema = createTaskSchema.partial().meta({ id: 'UpdateTask' });

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Query of `GET /projects/:id/tasks`. */
export const taskListQuerySchema = z.strictObject({
  status: taskStatusSchema.optional(),
});

export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

/** A task as returned by the API. */
export const taskSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    title: z.string(),
    description: z.string(),
    type: taskTypeSchema,
    priority: taskPrioritySchema,
    status: taskStatusSchema,
    acceptanceCriteria: z.string(),
    labels: z.array(z.string()),
    position: z.number(),
    parentId: z.uuid().nullable(),
    /** The newest run of the task, or `null` when it has never run. */
    latestRun: runSummarySchema.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Task' });

export type TaskDto = z.infer<typeof taskSchema>;

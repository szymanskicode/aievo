import { describe, expect, it } from 'vitest';

import { createTaskSchema, taskListQuerySchema, taskSchema, updateTaskSchema } from './task.js';

describe('createTaskSchema', () => {
  it('needs only a title and trims it', () => {
    expect(createTaskSchema.parse({ title: '  Fix it  ' })).toEqual({ title: 'Fix it' });
  });

  it('rejects a blank title', () => {
    expect(createTaskSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(createTaskSchema.safeParse({ title: 'A', projectId: 'x' }).success).toBe(false);
  });

  it('rejects an unknown status and a non-finite position', () => {
    expect(createTaskSchema.safeParse({ title: 'A', status: 'archived' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'A', position: Infinity }).success).toBe(false);
  });
});

describe('updateTaskSchema', () => {
  it('accepts a move on the board without filling other fields', () => {
    expect(updateTaskSchema.parse({ status: 'ready', position: 1.5 })).toEqual({
      status: 'ready',
      position: 1.5,
    });
  });

  it('accepts clearing the parent', () => {
    expect(updateTaskSchema.parse({ parentId: null })).toEqual({ parentId: null });
  });
});

describe('taskListQuerySchema', () => {
  it('accepts an optional status filter', () => {
    expect(taskListQuerySchema.parse({})).toEqual({});
    expect(taskListQuerySchema.parse({ status: 'done' })).toEqual({ status: 'done' });
  });

  it('rejects an unknown status', () => {
    expect(taskListQuerySchema.safeParse({ status: 'nope' }).success).toBe(false);
  });
});

describe('taskSchema', () => {
  it('requires ISO timestamps', () => {
    const task = {
      id: '00000000-0000-4000-8000-000000000011',
      projectId: '00000000-0000-4000-8000-000000000003',
      title: 'A',
      description: '',
      type: 'feature',
      priority: 'medium',
      status: 'draft',
      acceptanceCriteria: '',
      labels: [],
      position: 1,
      parentId: null,
      latestRun: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(taskSchema.safeParse(task).success).toBe(true);
    expect(taskSchema.safeParse({ ...task, createdAt: 'yesterday' }).success).toBe(false);
  });

  it('carries the latest run of the task', () => {
    const task = {
      id: '00000000-0000-4000-8000-000000000011',
      projectId: '00000000-0000-4000-8000-000000000003',
      title: 'A',
      description: '',
      type: 'feature',
      priority: 'medium',
      status: 'in_review',
      acceptanceCriteria: '',
      labels: [],
      position: 1,
      parentId: null,
      latestRun: {
        id: '00000000-0000-4000-8000-000000000021',
        status: 'succeeded',
        prUrl: 'https://github.com/octocat/demo/pull/7',
        prNumber: 7,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(taskSchema.parse(task)).toEqual(task);
    expect(taskSchema.safeParse({ ...task, latestRun: { id: 'x' } }).success).toBe(false);
  });
});

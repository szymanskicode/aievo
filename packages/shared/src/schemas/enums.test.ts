import { describe, expect, it } from 'vitest';

import {
  gitProviderSchema,
  providerTypeSchema,
  runStatuses,
  runStatusSchema,
  stepStatusSchema,
  taskStatuses,
  taskStatusSchema,
  taskTypeSchema,
} from './enums.js';

describe('enum schemas', () => {
  it('lists task statuses in lifecycle order from the architecture doc', () => {
    expect(taskStatuses).toEqual([
      'draft',
      'clarifying',
      'ready',
      'running',
      'needs_human',
      'in_review',
      'done',
      'failed',
      'cancelled',
    ]);
  });

  it('lists run statuses in the order a successful run goes through them', () => {
    expect(runStatuses).toEqual([
      'queued',
      'preparing',
      'running',
      'committing',
      'succeeded',
      'failed',
      'cancelled',
    ]);
  });

  it('accepts known values', () => {
    expect(taskStatusSchema.parse('needs_human')).toBe('needs_human');
    expect(taskTypeSchema.parse('bug')).toBe('bug');
    expect(providerTypeSchema.parse('openai-compatible')).toBe('openai-compatible');
    expect(gitProviderSchema.parse('github')).toBe('github');
    expect(runStatusSchema.parse('committing')).toBe('committing');
    expect(stepStatusSchema.parse('running')).toBe('running');
  });

  it('rejects unknown values', () => {
    expect(taskStatusSchema.safeParse('archived').success).toBe(false);
    expect(providerTypeSchema.safeParse('google').success).toBe(false);
    expect(gitProviderSchema.safeParse('gitlab').success).toBe(false);
    expect(runStatusSchema.safeParse('done').success).toBe(false);
    expect(stepStatusSchema.safeParse('committing').success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { providerTypeSchema, taskStatuses, taskStatusSchema, taskTypeSchema } from './enums.js';

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

  it('accepts known values', () => {
    expect(taskStatusSchema.parse('needs_human')).toBe('needs_human');
    expect(taskTypeSchema.parse('bug')).toBe('bug');
    expect(providerTypeSchema.parse('openai-compatible')).toBe('openai-compatible');
  });

  it('rejects unknown values', () => {
    expect(taskStatusSchema.safeParse('archived').success).toBe(false);
    expect(providerTypeSchema.safeParse('google').success).toBe(false);
  });
});

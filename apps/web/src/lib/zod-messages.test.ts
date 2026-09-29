import { createProjectSchema, createTaskSchema } from '@aievo/shared';
import { describe, expect, it } from 'vitest';

import './zod-messages';

function messages(result: { error?: { issues: { message: string }[] } }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('form messages for the shared schemas', () => {
  it('reports an empty required string as "Required"', () => {
    expect(messages(createProjectSchema.safeParse({ name: '' }))).toEqual(['Required']);
  });

  it('reports the maximum length', () => {
    const result = createTaskSchema.safeParse({ title: 'x', labels: ['y'.repeat(51)] });

    expect(messages(result)).toEqual(['Must be at most 50 characters']);
  });

  it('reports an invalid URL', () => {
    const result = createProjectSchema.safeParse({ name: 'p', repoUrl: 'ftp://example.com' });

    expect(messages(result)).toEqual(['Enter a valid http(s) URL']);
  });
});

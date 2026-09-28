import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as shared from '../index.js';

/**
 * `.meta({ id })` names a schema as a component of the OpenAPI document. Derived schemas
 * (e.g. `.partial()`) must not inherit the id, or two components would share one name.
 */
describe('schema ids', () => {
  it('are unique across exported schemas', () => {
    const ids = (Object.values(shared) as unknown[])
      .filter((value): value is z.ZodType => value instanceof z.ZodType)
      .map((schema) => z.globalRegistry.get(schema)?.id)
      .filter((id): id is string => id !== undefined);

    expect(ids).toContain('Project');
    expect(ids).toContain('UpdateTask');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keep derived schemas separate from their source', () => {
    expect(z.globalRegistry.get(shared.createProjectSchema)?.id).toBe('CreateProject');
    expect(z.globalRegistry.get(shared.updateProjectSchema)?.id).toBe('UpdateProject');
  });
});

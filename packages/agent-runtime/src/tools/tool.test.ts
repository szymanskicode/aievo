import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { TOOLS } from './index.js';
import { describeIssues, toToolDefinition } from './tool.js';

describe('toToolDefinition', () => {
  it('turns the Zod input into a JSON Schema where defaulted fields are optional', () => {
    const definition = toToolDefinition({
      name: 'demo',
      description: 'Demo tool',
      input: z.object({ path: z.string(), limit: z.number().default(5) }),
    });

    expect(definition).toEqual({
      name: 'demo',
      description: 'Demo tool',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, limit: { type: 'number', default: 5 } },
        required: ['path'],
      },
    });
  });

  it('describes every built-in tool as an object schema', () => {
    for (const tool of Object.values(TOOLS)) {
      const definition = toToolDefinition(tool);
      expect(definition.description.length).toBeGreaterThan(20);
      expect(definition.inputSchema).toMatchObject({ type: 'object' });
    }
  });
});

describe('describeIssues', () => {
  it('names the path of each issue', () => {
    const result = z.object({ a: z.object({ b: z.string() }) }).safeParse({ a: { b: 1 } });
    const root = z.string().safeParse(1);

    expect(result.success || describeIssues(result.error)).toEqual([
      'a.b: Invalid input: expected string, received number',
    ]);
    expect(root.success || describeIssues(root.error)).toEqual([
      '(root): Invalid input: expected string, received number',
    ]);
  });
});

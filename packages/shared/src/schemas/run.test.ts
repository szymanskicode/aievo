import { describe, expect, it } from 'vitest';

import { runStatuses } from './enums.js';
import type { RunStatus } from './enums.js';
import {
  ACTIVE_RUN_STATUSES,
  FINAL_RUN_STATUSES,
  TOOL_RESULT_MAX_CHARS,
  isFinalRunStatus,
  TOOL_CALL_PAGE_DEFAULT,
  TOOL_CALL_PAGE_MAX,
  runSchema,
  runStepsQuerySchema,
  stepSchema,
  toolCallsQuerySchema,
  truncateToolResult,
} from './run.js';

describe('truncateToolResult', () => {
  it('returns short text unchanged', () => {
    expect(truncateToolResult('ok')).toBe('ok');
    const exact = 'x'.repeat(TOOL_RESULT_MAX_CHARS);
    expect(truncateToolResult(exact)).toBe(exact);
  });

  it('keeps the head and the tail within the limit', () => {
    const text = `HEAD${'-'.repeat(50_000)}TAIL`;

    const result = truncateToolResult(text);

    expect(result.length).toBeLessThanOrEqual(TOOL_RESULT_MAX_CHARS);
    expect(result.startsWith('HEAD')).toBe(true);
    expect(result.endsWith('TAIL')).toBe(true);
  });

  it('reports how many characters were cut out', () => {
    const text = 'a'.repeat(100) + 'b'.repeat(100);

    const result = truncateToolResult(text, 80);

    const omitted = Number(/\[… (\d+) characters omitted …\]/.exec(result)?.[1]);
    const kept = result.replace(/\n\[… \d+ characters omitted …\]\n/, '');
    expect(kept.length + omitted).toBe(text.length);
    expect(result.length).toBeLessThanOrEqual(80);
  });

  it('cuts plainly when the limit is smaller than the marker', () => {
    expect(truncateToolResult('abcdefghij', 4)).toBe('abcd');
  });
});

describe('run statuses', () => {
  it('splits every status into queued, active or final', () => {
    const classified = new Set<RunStatus>([
      'queued',
      ...ACTIVE_RUN_STATUSES,
      ...FINAL_RUN_STATUSES,
    ]);
    expect([...classified].sort()).toEqual([...runStatuses].sort());
  });

  it('recognizes final statuses', () => {
    expect(isFinalRunStatus('succeeded')).toBe(true);
    expect(isFinalRunStatus('cancelled')).toBe(true);
    expect(isFinalRunStatus('running')).toBe(false);
    expect(isFinalRunStatus('queued')).toBe(false);
  });
});

describe('runSchema', () => {
  const run = {
    id: '6f1f7a36-4b8e-4b8f-9a2e-0d8c4b3b1f00',
    taskId: '0d0c1f7a-3e5b-4a44-8f3a-2c6d9e1b7a11',
    status: 'failed',
    branch: 'agent/0d0c1f7a-fix-login',
    prUrl: null,
    prNumber: null,
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    error: { code: 'tests_failed', message: 'Tests exited with code 1' },
    cancelRequestedAt: null,
    startedAt: '2026-09-29T10:00:00.000Z',
    endedAt: '2026-09-29T10:05:00.000Z',
    createdAt: '2026-09-29T09:59:00.000Z',
  };

  it('accepts a run DTO', () => {
    expect(runSchema.parse(run)).toEqual(run);
  });

  it('rejects an error without a code', () => {
    expect(runSchema.safeParse({ ...run, error: { message: 'x' } }).success).toBe(false);
  });
});

describe('tool call paging queries', () => {
  it('defaults the page size and coerces it from the query string', () => {
    expect(runStepsQuerySchema.parse({})).toEqual({ toolCallLimit: TOOL_CALL_PAGE_DEFAULT });
    expect(toolCallsQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10 });
  });

  it('rejects pages that are too large or a cursor that is not an id', () => {
    expect(
      runStepsQuerySchema.safeParse({ toolCallLimit: String(TOOL_CALL_PAGE_MAX + 1) }).success,
    ).toBe(false);
    expect(toolCallsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(toolCallsQuerySchema.safeParse({ after: 'abc' }).success).toBe(false);
  });
});

describe('stepSchema', () => {
  const step = {
    id: '6f1f7a36-4b8e-4b8f-9a2e-0d8c4b3b1f01',
    runId: '6f1f7a36-4b8e-4b8f-9a2e-0d8c4b3b1f00',
    stepKey: 'implement',
    agentKey: 'coder',
    iteration: 1,
    status: 'succeeded',
    costUsd: 0.01,
    tokensIn: 100,
    tokensOut: 20,
    result: {
      summary: 'Added a greeting',
      changedFiles: ['src/hello.ts'],
      tests: { commands: ['npm test'], passed: true, summary: '1 passed' },
      openIssues: [],
    },
    error: null,
    iterations: 3,
    toolCallCount: 1,
    toolCalls: {
      items: [
        {
          id: '6f1f7a36-4b8e-4b8f-9a2e-0d8c4b3b1f02',
          stepId: '6f1f7a36-4b8e-4b8f-9a2e-0d8c4b3b1f01',
          tool: 'read_file',
          args: { path: 'README.md' },
          result: '# demo',
          isError: false,
          durationMs: 4,
          exitCode: null,
          createdAt: '2026-09-29T10:01:00.000Z',
        },
      ],
      nextCursor: null,
    },
    startedAt: '2026-09-29T10:00:00.000Z',
    endedAt: '2026-09-29T10:05:00.000Z',
    createdAt: '2026-09-29T10:00:00.000Z',
  };

  it('accepts a step DTO with its tool calls', () => {
    expect(stepSchema.parse(step)).toEqual(step);
  });

  it('accepts a step without a result yet', () => {
    expect(stepSchema.safeParse({ ...step, result: null, iterations: null }).success).toBe(true);
  });
});

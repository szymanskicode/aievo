import { describe, expect, it } from 'vitest';

import { CODER_RESULT } from '../test/fixtures.js';
import { parseAcceptanceCriteria, pullRequestBody, pullRequestTitle } from './pr-body.js';
import type { PullRequestData } from './pr-body.js';

const data: PullRequestData = {
  task: {
    title: 'Add sum',
    description: 'Add `sum(a, b)`.',
    acceptanceCriteria: ['sum(2, 3) is 5'],
  },
  result: CODER_RESULT,
  changedFiles: [
    { status: 'modified', path: 'src/math.ts' },
    { status: 'added', path: 'src/sum.test.ts' },
  ],
  restoredTests: [],
  check: { command: 'npm test', passed: true, exitCode: 0, timedOut: false, output: '3 passed' },
  run: {
    url: 'http://127.0.0.1:5173/runs/r1',
    iterations: 4,
    tokensIn: 12_345,
    tokensOut: 678,
    costUsd: 0.04567,
    model: 'Claude Test',
    agent: 'Programista (coder@sha256:abc)',
  },
};

describe('pullRequestBody', () => {
  it('describes the task, the change, the tests and the run', () => {
    expect(pullRequestBody(data)).toBe(
      [
        '## Task',
        '',
        '**Add sum**',
        '',
        'Add `sum(a, b)`.',
        '',
        '### Acceptance criteria',
        '',
        '- sum(2, 3) is 5',
        '',
        '## Summary',
        '',
        'Added sum(a, b) to src/math.ts with tests.',
        '',
        '## Changed files (2)',
        '',
        '- `src/math.ts` (modified)',
        '- `src/sum.test.ts` (added)',
        '',
        '## Tests',
        '',
        'Run by AIEvo after the agent finished: `npm test` ✅ passed',
        '',
        '<details><summary>Output (last 60 lines)</summary>',
        '',
        '```',
        '3 passed',
        '```',
        '',
        '</details>',
        '',
        'Reported by the agent (`npm test`): passed, 2 tests passed',
        '',
        '## Run',
        '',
        '- Agent: Programista (coder@sha256:abc), model Claude Test',
        '- Iterations: 4',
        '- Tokens: 12,345 in, 678 out',
        '- Cost: 0.0457 USD',
        '- Details: http://127.0.0.1:5173/runs/r1',
        '',
      ].join('\n'),
    );
  });

  it('adds the open issues in their own section', () => {
    const body = pullRequestBody({
      ...data,
      result: { ...CODER_RESULT, openIssues: ['Check rounding', 'Two\nlines'] },
    });

    expect(body).toContain('## Open issues\n\n- Check rounding\n- Two lines\n\n## Run');
  });

  it('marks failed and timed out tests', () => {
    const failed = { ...data.check, passed: false, exitCode: 1 };
    expect(pullRequestBody({ ...data, check: failed })).toContain('❌ failed (exit code 1)');
    const timedOut = { ...data.check, passed: false, exitCode: null, timedOut: true };
    expect(pullRequestBody({ ...data, check: timedOut })).toContain('❌ timed out');
  });

  it('keeps test output inside its code block and shows only its end', () => {
    const output = [...Array.from({ length: 100 }, (_, i) => `line ${i}`), '```', 'end'].join('\n');
    const body = pullRequestBody({ ...data, check: { ...data.check, output } });

    expect(body).toContain('````\n');
    expect(body).not.toContain('line 41\n');
    expect(body).toContain('line 42\n');
  });

  it('leaves out a test output too long for GitHub first', () => {
    const changedFiles = Array.from({ length: 5_000 }, (_, i) => ({
      status: 'added' as const,
      path: `${'dir/'.repeat(20)}file-${i}.ts`,
    }));
    const body = pullRequestBody({
      ...data,
      changedFiles,
      check: { ...data.check, output: 'y'.repeat(70_000) },
    });

    expect(body.length).toBeLessThanOrEqual(65_536);
    expect(body).toContain('- … and 4800 more');
    expect(body).not.toContain('yyyy');
    expect(body).toContain('_The output is too long for this description; see it in the run');
    expect(body).toContain('## Run');
  });

  it('cuts an overlong description at a paragraph boundary', () => {
    const openIssues = Array.from({ length: 50 }, (_, i) => `${i} ${'z'.repeat(1_990)}`);
    const body = pullRequestBody({ ...data, result: { ...CODER_RESULT, openIssues } });

    expect(body.length).toBeLessThanOrEqual(65_536);
    expect(body).toMatch(
      /\n\n…\n\n_The description was too long and was cut; see the run in AIEvo: http:\/\/127\.0\.0\.1:5173\/runs\/r1_\n$/,
    );
    expect(body).toContain('## Summary');
  });

  it('lists existing tests the platform restored', () => {
    const body = pullRequestBody({ ...data, restoredTests: ['src/a.test.ts'] });

    expect(body).toContain(
      '## Existing tests restored\n\nCommands the agent ran changed these existing test files.',
    );
    expect(body).toContain('- `src/a.test.ts`\n\n## Run');
  });
});

describe('pullRequestTitle', () => {
  it('is the task title on one line, at most 256 characters', () => {
    expect(pullRequestTitle('  Add\n sum  ')).toBe('Add sum');
    expect(pullRequestTitle('a'.repeat(300))).toHaveLength(256);
  });
});

describe('parseAcceptanceCriteria', () => {
  it('reads one criterion per line without list markers', () => {
    expect(parseAcceptanceCriteria('- one\n* two\n\n3. three\n  plain  \n')).toEqual([
      'one',
      'two',
      'three',
      'plain',
    ]);
    expect(parseAcceptanceCriteria('')).toEqual([]);
  });
});

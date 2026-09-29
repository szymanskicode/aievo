import type { Schemas } from '@aievo/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runFixture, stepFixture, taskFixture, toolCallFixture } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

import { RUN_POLL_MS } from './run-status';

const task = taskFixture({ title: 'Add greeting', status: 'running' });

const coderResult: NonNullable<Schemas['Step']['result']> = {
  summary: 'Added a greeting to the home page',
  changedFiles: ['src/hello.ts', 'src/hello.test.ts'],
  tests: { commands: ['npm test'], passed: true, summary: '2 passed' },
  openIssues: ['The copy needs a review'],
};

let run: Schemas['Run'];
let steps: Schemas['Step'][];
let cancelRequests: number;

beforeEach(() => {
  cancelRequests = 0;
  server.use(
    http.get(apiUrl(`/tasks/${task.id}`), () => HttpResponse.json(task)),
    http.get(apiUrl('/runs/:id'), () => HttpResponse.json(run)),
    http.get(apiUrl('/runs/:id/steps'), () => HttpResponse.json(steps)),
    http.post(apiUrl('/runs/:id/cancel'), () => {
      cancelRequests += 1;
      run = { ...run, cancelRequestedAt: '2026-09-29T10:02:00.000Z' };
      return HttpResponse.json(run);
    }),
  );
});

function implementStep(overrides: Partial<Schemas['Step']> = {}): Schemas['Step'] {
  const id = overrides.id ?? '00000000-0000-4000-8000-00000000a001';
  const calls = [
    toolCallFixture({ stepId: id, tool: 'read_file', args: { path: 'src/app.ts' } }),
    toolCallFixture({
      stepId: id,
      tool: 'run_command',
      args: { command: 'npm test' },
      result: 'FAIL src/hello.test.ts\nExpected "Hello"',
      isError: true,
      exitCode: 1,
      durationMs: 2_300,
    }),
  ];
  return stepFixture({
    id,
    runId: run.id,
    toolCallCount: calls.length,
    toolCalls: { items: calls, nextCursor: null },
    ...overrides,
  });
}

async function openRun() {
  const view = renderApp(`/runs/${run.id}`);
  await screen.findByRole('heading', { name: 'Run of “Add greeting”' });
  return view;
}

describe('RunPage', () => {
  it('shows a running run with its steps and lets the user cancel it', async () => {
    run = runFixture({
      taskId: task.id,
      status: 'running',
      branch: 'agent/add-greeting',
      costUsd: 0.1234,
      tokensIn: 12_000,
      tokensOut: 800,
    });
    steps = [implementStep()];
    const { user } = await openRun();

    expect(screen.getByText('Running', { selector: '[data-slot=badge]' })).toBeInTheDocument();
    expect(screen.getByText('agent/add-greeting')).toBeInTheDocument();
    expect(screen.getByText('$0.1234')).toBeInTheDocument();
    expect(screen.getByText('12,000 in / 800 out')).toBeInTheDocument();
    const step = await screen.findByRole('listitem', { name: 'Programista implements the task' });
    expect(within(step).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Agent summary' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel run' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Cancel this run?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel run' }));

    expect(await screen.findByText('Stopping…')).toBeInTheDocument();
    expect(cancelRequests).toBe(1);
    expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();
  });

  it('shows a succeeded run with its pull request and the agent summary at the end', async () => {
    run = runFixture({
      taskId: task.id,
      status: 'succeeded',
      prUrl: 'https://github.com/octocat/shop/pull/12',
      prNumber: 12,
      endedAt: '2026-09-29T10:04:00.000Z',
    });
    steps = [
      implementStep({ status: 'succeeded', result: coderResult, iterations: 6 }),
      stepFixture({ runId: run.id, stepKey: 'check', agentKey: 'platform', status: 'succeeded' }),
    ];
    await openRun();

    expect(screen.getByText('Succeeded', { selector: '[data-slot=badge]' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#12' })).toHaveAttribute(
      'href',
      'https://github.com/octocat/shop/pull/12',
    );
    expect(screen.getByText('4 min')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();

    const summary = await screen.findByRole('region', { name: 'Agent summary' });
    expect(summary).toHaveTextContent('Added a greeting to the home page');
    expect(summary).toHaveTextContent('src/hello.test.ts');
    expect(summary).toHaveTextContent('2 passed');
    expect(summary).toHaveTextContent('The copy needs a review');
    // The summary comes after the whole timeline.
    const timeline = screen.getByRole('list', { name: 'Steps' });
    expect(timeline.compareDocumentPosition(summary)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      within(timeline).getAllByRole('listitem', { name: /Programista|Platform/ }),
    ).toHaveLength(2);
    expect(screen.getByText(/6 model calls/)).toBeInTheDocument();
  });

  it('shows why a failed run failed at the top and marks failing tool calls', async () => {
    run = runFixture({
      taskId: task.id,
      status: 'failed',
      error: { code: 'iteration_limit', message: 'The agent used all 40 iterations' },
      endedAt: '2026-09-29T10:04:00.000Z',
    });
    steps = [
      implementStep({
        status: 'failed',
        error: { code: 'iteration_limit', message: 'Too many iterations' },
      }),
    ];
    await openRun();

    // The run's error comes first; the failed step has its own further down.
    const [alert] = await screen.findAllByRole('alert');
    expect(alert).toHaveTextContent('The run failed');
    expect(alert).toHaveTextContent('The agent used all 40 iterations');
    expect(alert).toHaveTextContent('iteration_limit');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.compareDocumentPosition(alert!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const step = await screen.findByRole('listitem', { name: 'Programista implements the task' });
    expect(within(step).getByText('The step failed (iteration_limit)')).toBeInTheDocument();
    expect(within(step).getByRole('listitem', { name: 'run_command (error)' })).toHaveTextContent(
      'exit 1',
    );
    expect(within(step).getByRole('listitem', { name: 'read_file' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();
  });

  it('shows a cancelled run without a cancel button', async () => {
    run = runFixture({
      taskId: task.id,
      status: 'cancelled',
      cancelRequestedAt: '2026-09-29T10:01:00.000Z',
      endedAt: '2026-09-29T10:01:05.000Z',
    });
    steps = [implementStep({ status: 'cancelled' })];
    await openRun();

    expect(screen.getByText('Cancelled', { selector: '[data-slot=badge]' })).toBeInTheDocument();
    expect(await screen.findByText('Stopped')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();
    expect(screen.queryByText('Stopping…')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens and closes the result of a tool call', async () => {
    run = runFixture({ taskId: task.id, status: 'running' });
    steps = [implementStep()];
    const { user } = await openRun();

    const call = await screen.findByRole('listitem', { name: 'run_command (error)' });
    const toggle = within(call).getByRole('button', { name: /run_command/ });
    expect(toggle).toHaveTextContent('command: npm test');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).not.toHaveAttribute('aria-controls');
    expect(within(call).queryByLabelText('Result of run_command')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const result = within(call).getByLabelText('Result of run_command');
    expect(result).toHaveTextContent('Expected "Hello"');
    expect(toggle).toHaveAttribute('aria-controls', result.id);

    await user.click(toggle);

    expect(within(call).queryByLabelText('Result of run_command')).not.toBeInTheDocument();
  });

  it('loads tool calls beyond the first page on demand', async () => {
    run = runFixture({ taskId: task.id, status: 'succeeded' });
    const step = implementStep();
    const last = step.toolCalls.items.at(-1)!;
    steps = [{ ...step, toolCallCount: 3, toolCalls: { ...step.toolCalls, nextCursor: last.id } }];
    const requested: (string | null)[] = [];
    server.use(
      http.get(apiUrl(`/steps/${step.id}/tool-calls`), ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('after'));
        return HttpResponse.json({
          items: [toolCallFixture({ stepId: step.id, tool: 'write_file', args: { path: 'a' } })],
          nextCursor: null,
        });
      }),
    );
    const { user } = await openRun();

    await user.click(await screen.findByRole('button', { name: 'Show 1 more tool calls' }));

    expect(await screen.findByRole('listitem', { name: 'write_file' })).toBeInTheDocument();
    expect(requested).toEqual([last.id]);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /more tool calls/ })).not.toBeInTheDocument(),
    );
  });

  it('shows an error for a run that does not exist', async () => {
    run = runFixture();
    server.use(
      http.get(apiUrl('/runs/:id'), () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Run not found' } },
          { status: 404 },
        ),
      ),
    );
    renderApp(`/runs/${run.id}`);

    expect(await screen.findByText('Could not load the run')).toBeInTheDocument();
    expect(screen.getByText('Run not found')).toBeInTheDocument();
  });
});

describe('RunPage polling', () => {
  let runRequests: number;
  let stepRequests: number;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    runRequests = 0;
    stepRequests = 0;
    server.use(
      http.get(apiUrl('/runs/:id'), () => {
        runRequests += 1;
        return HttpResponse.json(run);
      }),
      http.get(apiUrl('/runs/:id/steps'), () => {
        stepRequests += 1;
        return HttpResponse.json(steps);
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('follows an open run until it ends, then stops asking', async () => {
    run = runFixture({ taskId: task.id, status: 'running' });
    steps = [implementStep()];
    await openRun();
    await screen.findByRole('listitem', { name: 'Programista implements the task' });

    // The worker finishes: the run succeeds and the platform's check step appears.
    run = { ...run, status: 'succeeded', endedAt: '2026-09-29T10:04:00.000Z' };
    steps = [
      implementStep({ status: 'succeeded', result: coderResult }),
      stepFixture({ runId: run.id, stepKey: 'check', agentKey: 'platform', status: 'succeeded' }),
    ];
    await vi.advanceTimersByTimeAsync(RUN_POLL_MS);

    expect(
      await screen.findByText('Succeeded', { selector: '[data-slot=badge]' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('listitem', { name: 'Platform runs the tests' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Agent summary' })).toBeInTheDocument();

    const settled = { runs: runRequests, steps: stepRequests };
    await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 3);

    expect({ runs: runRequests, steps: stepRequests }).toEqual(settled);
  });

  it('reads the steps and the task once more when the run ends between two polls', async () => {
    run = runFixture({ taskId: task.id, status: 'queued', startedAt: null });
    steps = [];
    let taskRequests = 0;
    server.use(
      http.get(apiUrl(`/tasks/${task.id}`), () => {
        taskRequests += 1;
        return HttpResponse.json(task);
      }),
      http.post(apiUrl('/runs/:id/cancel'), () => {
        // A queued run is cancelled at once; the cancel answer ends it, no poll does.
        run = { ...run, status: 'cancelled', endedAt: '2026-09-29T10:00:05.000Z' };
        steps = [implementStep({ status: 'cancelled' })];
        return HttpResponse.json(run);
      }),
    );
    const { user } = await openRun();
    expect(await screen.findByText('Waiting for a worker…')).toBeInTheDocument();
    const before = { steps: stepRequests, task: taskRequests };

    await user.click(screen.getByRole('button', { name: 'Cancel run' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Cancel this run?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel run' }));

    expect(
      await screen.findByRole('listitem', { name: 'Programista implements the task' }),
    ).toBeInTheDocument();
    expect(stepRequests).toBe(before.steps + 1);
    // The task moved on with its run; the header and the board read it again.
    await waitFor(() => expect(taskRequests).toBe(before.task + 1));
  });

  it('does not poll a run that has already ended', async () => {
    run = runFixture({ taskId: task.id, status: 'failed', endedAt: '2026-09-29T10:04:00.000Z' });
    steps = [implementStep({ status: 'failed' })];
    await openRun();
    await screen.findByRole('listitem', { name: 'Programista implements the task' });

    await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 3);

    expect(runRequests).toBe(1);
    expect(stepRequests).toBe(1);
  });
});

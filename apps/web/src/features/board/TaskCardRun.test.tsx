import type { Schemas } from '@aievo/api-client';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RUN_POLL_MS } from '@/features/runs/run-status';
import { fakeId, projectFixture, taskFixture } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

const project = projectFixture({ name: 'Shop' });

describe('the run on a task card', () => {
  it('marks tasks an agent works on and links pull requests', async () => {
    server.use(
      http.get(apiUrl(`/projects/${project.id}`), () => HttpResponse.json(project)),
      http.get(apiUrl(`/projects/${project.id}/tasks`), () =>
        HttpResponse.json([
          taskFixture({
            projectId: project.id,
            title: 'Working',
            status: 'running',
            latestRun: { id: fakeId(), status: 'running', prUrl: null, prNumber: null },
          }),
          taskFixture({
            projectId: project.id,
            title: 'Reviewed',
            status: 'in_review',
            latestRun: {
              id: fakeId(),
              status: 'succeeded',
              prUrl: 'https://github.com/octocat/shop/pull/4',
              prNumber: 4,
            },
          }),
          taskFixture({
            projectId: project.id,
            title: 'Failed',
            status: 'needs_human',
            latestRun: { id: fakeId(), status: 'failed', prUrl: null, prNumber: null },
          }),
          taskFixture({ projectId: project.id, title: 'Idle' }),
        ]),
      ),
    );
    renderApp(`/projects/${project.id}`);

    const working = await screen.findByRole('listitem', { name: 'Working' });
    expect(within(working).getByText('Agent working')).toBeInTheDocument();

    const reviewed = screen.getByRole('listitem', { name: 'Reviewed' });
    expect(within(reviewed).queryByText('Agent working')).not.toBeInTheDocument();
    expect(within(reviewed).getByRole('link', { name: 'PR #4' })).toHaveAttribute(
      'href',
      'https://github.com/octocat/shop/pull/4',
    );

    for (const title of ['Failed', 'Idle']) {
      const card = screen.getByRole('listitem', { name: title });
      expect(within(card).queryByText('Agent working')).not.toBeInTheDocument();
      expect(within(card).queryByRole('link', { name: /PR #/ })).not.toBeInTheDocument();
    }
  });
});

describe('board polling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function mockTasks(tasks: () => Schemas['Task'][]) {
    let requests = 0;
    server.use(
      http.get(apiUrl(`/projects/${project.id}`), () => HttpResponse.json(project)),
      http.get(apiUrl(`/projects/${project.id}/tasks`), () => {
        requests += 1;
        return HttpResponse.json(tasks());
      }),
    );
    return () => requests;
  }

  it('follows a task while its run is open and stops when it ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runId = fakeId();
    const task = taskFixture({ projectId: project.id, title: 'Working', status: 'running' });
    let latestRun: Schemas['Task']['latestRun'] = {
      id: runId,
      status: 'running',
      prUrl: null,
      prNumber: null,
    };
    const requests = mockTasks(() => [{ ...task, latestRun }]);
    renderApp(`/projects/${project.id}`);
    const card = await screen.findByRole('listitem', { name: 'Working' });
    expect(within(card).getByText('Agent working')).toBeInTheDocument();

    latestRun = {
      id: runId,
      status: 'succeeded',
      prUrl: 'https://github.com/octocat/shop/pull/9',
      prNumber: 9,
    };
    await vi.advanceTimersByTimeAsync(RUN_POLL_MS);

    expect(await within(card).findByRole('link', { name: 'PR #9' })).toBeInTheDocument();
    const settled = requests();
    await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 3);
    expect(requests()).toBe(settled);
  });

  it('does not poll a board without open runs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const requests = mockTasks(() => [taskFixture({ projectId: project.id, title: 'Idle' })]);
    renderApp(`/projects/${project.id}`);
    await screen.findByRole('listitem', { name: 'Idle' });

    await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 3);

    expect(requests()).toBe(1);
  });
});

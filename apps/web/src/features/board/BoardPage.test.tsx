import type { Schemas } from '@aievo/api-client';
import { taskStatuses } from '@aievo/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { statusLabels } from '@/features/tasks/labels';
import { projectFixture, taskFixture } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

const project = projectFixture({ name: 'Shop' });
const boardUrl = `/projects/${project.id}`;

function mockBoardApi(tasks: Schemas['Task'][]) {
  server.use(
    http.get(apiUrl(`/projects/${project.id}`), () => HttpResponse.json(project)),
    http.get(apiUrl(`/projects/${project.id}/tasks`), () => HttpResponse.json(tasks)),
  );
}

function column(name: string) {
  return screen.getByRole('region', { name });
}

describe('BoardPage', () => {
  it('shows a column for every status with the tasks in it', async () => {
    mockBoardApi([
      taskFixture({ projectId: project.id, title: 'Checkout', status: 'draft', labels: ['ui'] }),
      taskFixture({ projectId: project.id, title: 'Search', status: 'ready', priority: 'high' }),
    ]);
    renderApp(boardUrl);

    await screen.findByRole('heading', { name: 'Shop' });
    await screen.findByRole('listitem', { name: 'Checkout' });
    const board = screen.getByRole('group', { name: 'Task board' });
    expect(
      within(board)
        .getAllByRole('region')
        .map((region) => region.getAttribute('aria-label')),
    ).toEqual(taskStatuses.map((status) => statusLabels[status]));
    expect(within(column('Draft')).getByRole('listitem', { name: 'Checkout' })).toHaveTextContent(
      'ui',
    );
    expect(within(column('Ready')).getByRole('listitem', { name: 'Search' })).toHaveTextContent(
      'High priority',
    );
    expect(within(column('Done')).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('shows a hint when the project has no tasks', async () => {
    mockBoardApi([]);
    renderApp(boardUrl);

    expect(await screen.findByText(/No tasks yet/)).toBeInTheDocument();
  });

  it('shows the API error when the project does not exist', async () => {
    server.use(
      http.get(apiUrl(`/projects/${project.id}`), () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Project not found' } },
          { status: 404 },
        ),
      ),
      http.get(apiUrl(`/projects/${project.id}/tasks`), () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Project not found' } },
          { status: 404 },
        ),
      ),
    );
    renderApp(boardUrl);

    expect(await screen.findByRole('alert')).toHaveTextContent('Project not found');
  });

  it('moves a task to another status at once and saves status and position', async () => {
    const task = taskFixture({ projectId: project.id, title: 'Checkout', status: 'draft' });
    const tasks = [task, taskFixture({ projectId: project.id, status: 'ready', position: 7 })];
    mockBoardApi(tasks);
    let release = () => {};
    const saved = new Promise<void>((resolve) => (release = resolve));
    const patches: unknown[] = [];
    server.use(
      http.patch(apiUrl(`/tasks/${task.id}`), async ({ request }) => {
        const patch = (await request.json()) as Schemas['UpdateTask'];
        patches.push(patch);
        await saved;
        Object.assign(task, patch);
        return HttpResponse.json(task);
      }),
    );
    const { user } = renderApp(boardUrl);

    await user.click(await screen.findByRole('button', { name: 'Actions for Checkout' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ready' }));

    // Moved before the API answered.
    expect(within(column('Ready')).getByRole('listitem', { name: 'Checkout' })).toBeInTheDocument();
    expect(within(column('Draft')).queryByRole('listitem', { name: 'Checkout' })).toBeNull();
    await waitFor(() => expect(patches).toEqual([{ status: 'ready', position: 8 }]));

    release();
    await waitFor(() =>
      expect(
        within(column('Ready')).getByRole('listitem', { name: 'Checkout' }),
      ).toBeInTheDocument(),
    );
  });

  it('puts the task back and shows the error when saving the move fails', async () => {
    const task = taskFixture({ projectId: project.id, title: 'Checkout', status: 'draft' });
    mockBoardApi([task]);
    let rejected = false;
    server.use(
      // The board is refetched after the failed move; holding that answer back proves the
      // card comes back from the rollback, not from fresh data.
      http.get(apiUrl(`/projects/${project.id}/tasks`), async () => {
        if (rejected) await delay('infinite');
        return HttpResponse.json([task]);
      }),
      http.patch(apiUrl(`/tasks/${task.id}`), () => {
        rejected = true;
        return HttpResponse.json(
          { error: { code: 'internal_error', message: 'Database unavailable' } },
          { status: 500 },
        );
      }),
    );
    const { user } = renderApp(boardUrl);

    await user.click(await screen.findByRole('button', { name: 'Actions for Checkout' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Done' }));

    expect(
      await screen.findByText(/Could not move the task: Database unavailable/),
    ).toBeInTheDocument();
    expect(within(column('Draft')).getByRole('listitem', { name: 'Checkout' })).toBeInTheDocument();
    expect(within(column('Done')).queryByRole('listitem', { name: 'Checkout' })).toBeNull();
  });
});

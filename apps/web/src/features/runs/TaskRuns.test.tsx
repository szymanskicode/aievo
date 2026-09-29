import type { Schemas } from '@aievo/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  projectFixture,
  runFixture,
  setupStatusFixture,
  taskFixture,
  workspaceSettingsFixture,
} from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

const linkedProject = projectFixture({
  name: 'Shop',
  repoOwner: 'octocat',
  repoName: 'shop',
  gitCredentialId: '00000000-0000-4000-8000-0000000000aa',
  settings: { commands: { install: 'npm ci', test: 'npm test' } },
});

let project: Schemas['Project'];
let task: Schemas['Task'];
let runs: Schemas['Run'][];
let started: number;

function mockApi() {
  server.use(
    http.get(apiUrl(`/projects/${project.id}`), () => HttpResponse.json(project)),
    http.get(apiUrl(`/projects/${project.id}/tasks`), () => HttpResponse.json([task])),
    http.get(apiUrl(`/tasks/${task.id}`), () => HttpResponse.json(task)),
    http.get(apiUrl(`/tasks/${task.id}/runs`), () => HttpResponse.json(runs)),
    http.post(apiUrl(`/tasks/${task.id}/runs`), () => {
      started += 1;
      const run = runFixture({ taskId: task.id, status: 'queued', startedAt: null });
      runs = [run];
      return HttpResponse.json(run, { status: 201 });
    }),
    http.get(apiUrl('/runs/:id'), ({ params }) =>
      HttpResponse.json(runs.find((run) => run.id === params.id)),
    ),
    http.get(apiUrl('/runs/:id/steps'), () => HttpResponse.json([])),
  );
}

beforeEach(() => {
  project = linkedProject;
  task = taskFixture({ projectId: linkedProject.id, title: 'Add checkout', status: 'ready' });
  runs = [];
  started = 0;
});

async function openTask() {
  mockApi();
  const view = renderApp(`/projects/${project.id}?task=${task.id}`);
  const runsSection = await screen.findByRole('region', { name: 'Agent runs' });
  const button = await within(runsSection).findByRole('button', { name: 'Run agent' });
  return { ...view, runsSection, button };
}

describe('starting the agent from the task panel', () => {
  it('starts a run and opens its view', async () => {
    const { user, router, button } = await openTask();

    expect(button).toBeEnabled();
    await user.click(button);

    await waitFor(() => expect(router.state.location.pathname).toBe(`/runs/${runs[0]!.id}`));
    expect(started).toBe(1);
    expect(await screen.findByText('Waiting for a worker…')).toBeInTheDocument();
  });

  it('explains that a GitHub token is missing', async () => {
    server.use(
      http.get(apiUrl('/setup-status'), () =>
        HttpResponse.json(setupStatusFixture({ githubToken: false })),
      ),
    );
    const { button, runsSection } = await openTask();

    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/Add a GitHub token first/);
    expect(within(runsSection).getByRole('link', { name: 'Open GitHub settings' })).toHaveAttribute(
      'href',
      '/settings/github',
    );
  });

  it('explains that the Programista has no model', async () => {
    server.use(
      http.get(apiUrl('/workspace/settings'), () =>
        HttpResponse.json(workspaceSettingsFixture({ coder: null })),
      ),
    );
    const { button, runsSection } = await openTask();

    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/Choose the model for the Programista agent/);
    expect(within(runsSection).getByRole('link', { name: 'Choose a model' })).toHaveAttribute(
      'href',
      '/settings/models',
    );
  });

  it('explains that the project has no repository', async () => {
    project = projectFixture({ id: linkedProject.id, name: 'Shop' });
    const { button } = await openTask();

    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/not linked to a GitHub repository/);
  });

  it('explains that the project has no test command', async () => {
    project = { ...linkedProject, settings: { commands: { install: 'npm ci' } } };
    const { button } = await openTask();

    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/no test command/);
  });

  it('lists every missing piece at once', async () => {
    server.use(
      http.get(apiUrl('/setup-status'), () =>
        HttpResponse.json(setupStatusFixture({ githubToken: false })),
      ),
      http.get(apiUrl('/workspace/settings'), () =>
        HttpResponse.json(workspaceSettingsFixture({ coder: null })),
      ),
    );
    project = projectFixture({ id: linkedProject.id, name: 'Shop' });
    const { button } = await openTask();

    expect(button).toHaveAccessibleDescription(
      /GitHub token.*model for the Programista.*not linked/,
    );
  });

  it('does not start a second run while one is open', async () => {
    runs = [runFixture({ taskId: task.id, status: 'running' })];
    const { button } = await openTask();

    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/already working on this task/);
  });

  it('offers a retry when it cannot check what the agent needs', async () => {
    let fail = true;
    server.use(
      http.get(apiUrl('/workspace/settings'), () =>
        fail
          ? HttpResponse.json(
              { error: { code: 'internal_error', message: 'Database unavailable' } },
              { status: 500 },
            )
          : HttpResponse.json(workspaceSettingsFixture()),
      ),
    );
    mockApi();
    const { user } = renderApp(`/projects/${project.id}?task=${task.id}`);
    const runsSection = await screen.findByRole('region', { name: 'Agent runs' });
    expect(
      await within(runsSection).findByText('Could not check what the agent needs'),
    ).toBeInTheDocument();

    fail = false;
    await user.click(within(runsSection).getByRole('button', { name: 'Retry' }));

    expect(await within(runsSection).findByRole('button', { name: 'Run agent' })).toBeEnabled();
  });

  it('shows the error when the API refuses to start', async () => {
    const { user, button } = await openTask();
    server.use(
      http.post(apiUrl(`/tasks/${task.id}/runs`), () =>
        HttpResponse.json(
          { error: { code: 'run_already_active', message: 'The task already has a run' } },
          { status: 409 },
        ),
      ),
    );

    await user.click(button);

    expect(
      await screen.findByText('Could not start the agent: The task already has a run'),
    ).toBeInTheDocument();
  });
});

describe('runs of a task', () => {
  it('lists runs with status, cost and pull request', async () => {
    runs = [
      runFixture({
        taskId: task.id,
        status: 'succeeded',
        costUsd: 0.5,
        startedAt: '2026-09-29T10:00:00.000Z',
        endedAt: '2026-09-29T10:03:05.000Z',
        prUrl: 'https://github.com/octocat/shop/pull/7',
        prNumber: 7,
      }),
      runFixture({ taskId: task.id, status: 'failed', costUsd: 0.02 }),
    ];
    const { runsSection } = await openTask();

    const items = within(runsSection).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Succeeded');
    expect(items[0]).toHaveTextContent('3 min 5 s');
    expect(items[0]).toHaveTextContent('$0.5000');
    expect(within(items[0]!).getByRole('link', { name: /Pull request #7/ })).toHaveAttribute(
      'href',
      'https://github.com/octocat/shop/pull/7',
    );
    expect(items[1]).toHaveTextContent('Failed');
    expect(within(items[1]!).getByRole('link', { name: /Run from/ })).toHaveAttribute(
      'href',
      `/runs/${runs[1]!.id}`,
    );
  });
});

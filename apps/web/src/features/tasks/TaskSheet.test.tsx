import type { Schemas } from '@aievo/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { projectFixture, taskFixture } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

const project = projectFixture({ name: 'Shop' });
const boardUrl = `/projects/${project.id}`;

let tasks: Schemas['Task'][];
let requests: { method: string; body: unknown }[];

beforeEach(() => {
  tasks = [];
  requests = [];
  server.use(
    http.get(apiUrl(`/projects/${project.id}`), () => HttpResponse.json(project)),
    http.get(apiUrl(`/projects/${project.id}/tasks`), () => HttpResponse.json(tasks)),
    http.post(apiUrl(`/projects/${project.id}/tasks`), async ({ request }) => {
      const body = (await request.json()) as Schemas['CreateTask'];
      requests.push({ method: 'POST', body });
      const task = taskFixture({ ...body, projectId: project.id } as Partial<Schemas['Task']>);
      tasks.push(task);
      return HttpResponse.json(task, { status: 201 });
    }),
    http.get(apiUrl('/tasks/:id'), ({ params }) => {
      const task = tasks.find((candidate) => candidate.id === params.id);
      return task
        ? HttpResponse.json(task)
        : HttpResponse.json(
            { error: { code: 'not_found', message: 'Task not found' } },
            { status: 404 },
          );
    }),
    http.patch(apiUrl('/tasks/:id'), async ({ params, request }) => {
      const body = (await request.json()) as Schemas['UpdateTask'];
      requests.push({ method: 'PATCH', body });
      const task = tasks.find((candidate) => candidate.id === params.id) as Schemas['Task'];
      Object.assign(task, body, { updatedAt: new Date().toISOString() });
      return HttpResponse.json(task);
    }),
  );
});

async function openSheet(name: string) {
  return screen.findByRole('dialog', { name });
}

describe('TaskSheet', () => {
  it('opens the form for a new task from the board', async () => {
    const { user, router } = renderApp(boardUrl);

    await user.click(await screen.findByRole('link', { name: 'New task' }));

    await openSheet('New task');
    expect(router.state.location.search).toEqual({ task: 'new' });
  });

  it('validates with the shared schema and sends nothing while invalid', async () => {
    const { user } = renderApp(`${boardUrl}?task=new`);
    const sheet = await openSheet('New task');

    await user.type(within(sheet).getByLabelText('Labels'), `${'x'.repeat(51)}{Enter}`);
    await user.click(within(sheet).getByRole('button', { name: 'Create task' }));

    expect(await within(sheet).findByText('Required')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(within(sheet).getByText('Must be at most 50 characters')).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it('creates a task with every field and closes the panel', async () => {
    const { user, router } = renderApp(`${boardUrl}?task=new`);
    const sheet = await openSheet('New task');

    await user.type(within(sheet).getByLabelText('Title'), 'Add checkout');
    await user.type(within(sheet).getByLabelText('Description'), 'Pay with a card');
    await user.click(within(sheet).getByLabelText('Type'));
    await user.click(await screen.findByRole('option', { name: 'Bug' }));
    await user.click(within(sheet).getByLabelText('Priority'));
    await user.click(await screen.findByRole('option', { name: 'High' }));
    await user.type(within(sheet).getByLabelText('Acceptance criteria'), 'Order is paid');
    await user.type(within(sheet).getByLabelText('Labels'), 'ui{Enter}api,');
    await user.click(within(sheet).getByRole('button', { name: 'Remove label ui' }));
    await user.type(within(sheet).getByLabelText('Labels'), 'web{Enter}');
    await user.click(within(sheet).getByRole('button', { name: 'Create task' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests).toEqual([
      {
        method: 'POST',
        body: {
          title: 'Add checkout',
          description: 'Pay with a card',
          type: 'bug',
          priority: 'high',
          acceptanceCriteria: 'Order is paid',
          labels: ['api', 'web'],
        },
      },
    ]);
    expect(router.state.location.search).toEqual({});
    const draft = screen.getByRole('region', { name: 'Draft' });
    expect(
      await within(draft).findByRole('listitem', { name: 'Add checkout' }),
    ).toBeInTheDocument();
  });

  it('edits a task and sends only the changed fields', async () => {
    const task = taskFixture({ projectId: project.id, title: 'Old title', labels: ['ui'] });
    tasks.push(task);
    const { user } = renderApp(`${boardUrl}?task=${task.id}`);
    const sheet = await openSheet('Edit task');

    const title = await within(sheet).findByLabelText('Title');
    expect(title).toHaveValue('Old title');
    await user.clear(title);
    await user.type(title, 'New title');
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests).toEqual([{ method: 'PATCH', body: { title: 'New title' } }]);
  });

  it('sends the new labels when a label is removed and another added', async () => {
    const task = taskFixture({ projectId: project.id, title: 'Checkout', labels: ['ui', 'api'] });
    tasks.push(task);
    const { user } = renderApp(`${boardUrl}?task=${task.id}`);
    const sheet = await openSheet('Edit task');

    await user.click(await within(sheet).findByRole('button', { name: 'Remove label ui' }));
    await user.type(within(sheet).getByLabelText('Labels'), 'web{Enter}');
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests).toEqual([{ method: 'PATCH', body: { labels: ['api', 'web'] } }]);
  });

  it('sends all labels removed as an empty list', async () => {
    const task = taskFixture({ projectId: project.id, title: 'Checkout', labels: ['ui'] });
    tasks.push(task);
    const { user } = renderApp(`${boardUrl}?task=${task.id}`);
    const sheet = await openSheet('Edit task');

    await user.click(await within(sheet).findByRole('button', { name: 'Remove label ui' }));
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests).toEqual([{ method: 'PATCH', body: { labels: [] } }]);
  });

  it('closes without a request when nothing changed', async () => {
    const task = taskFixture({ projectId: project.id, title: 'Checkout', labels: ['ui'] });
    tasks.push(task);
    const { user } = renderApp(`${boardUrl}?task=${task.id}`);
    const sheet = await openSheet('Edit task');

    await within(sheet).findByLabelText('Title');
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests).toEqual([]);
  });

  it('refuses to edit a task of another project', async () => {
    const task = taskFixture({ title: 'Foreign task' });
    tasks.push(task);
    renderApp(`${boardUrl}?task=${task.id}`);
    const sheet = await openSheet('Edit task');

    expect(await within(sheet).findByText('Task not found')).toBeInTheDocument();
    expect(within(sheet).queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('opens a task from its card', async () => {
    const task = taskFixture({ projectId: project.id, title: 'Checkout' });
    tasks.push(task);
    const { user } = renderApp(boardUrl);

    await user.click(await screen.findByRole('link', { name: 'Checkout' }));

    const sheet = await openSheet('Edit task');
    expect(await within(sheet).findByLabelText('Title')).toHaveValue('Checkout');
  });

  it('shows an API error in the form and keeps the panel open', async () => {
    server.use(
      http.post(apiUrl(`/projects/${project.id}/tasks`), () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Project not found' } },
          { status: 404 },
        ),
      ),
    );
    const { user } = renderApp(`${boardUrl}?task=new`);
    const sheet = await openSheet('New task');

    await user.type(within(sheet).getByLabelText('Title'), 'Add checkout');
    await user.click(within(sheet).getByRole('button', { name: 'Create task' }));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Project not found');
  });
});

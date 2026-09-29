import type { Schemas } from '@aievo/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { projectFixture } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

/** A tiny in-memory projects API; returns the list so tests can inspect writes. */
function mockProjectsApi(initial: Schemas['Project'][] = []) {
  const projects = [...initial];
  const requests: unknown[] = [];
  server.use(
    http.get(apiUrl('/projects'), () => HttpResponse.json(projects)),
    http.post(apiUrl('/projects'), async ({ request }) => {
      const body = (await request.json()) as Schemas['CreateProject'];
      requests.push(body);
      const project = projectFixture({ ...body, description: body.description ?? '' });
      projects.push(project);
      return HttpResponse.json(project, { status: 201 });
    }),
    http.delete(apiUrl('/projects/:id'), ({ params }) => {
      const index = projects.findIndex((project) => project.id === params.id);
      projects.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { projects, requests };
}

describe('ProjectsPage', () => {
  it('shows a card for each project, linking to its board', async () => {
    const project = projectFixture({ name: 'Shop', repoUrl: 'https://github.com/acme/shop' });
    mockProjectsApi([project, projectFixture({ name: 'Blog' })]);
    renderApp('/projects');

    expect(await screen.findByRole('status', { name: 'Loading projects' })).toBeInTheDocument();
    const card = await screen.findByRole('article', { name: 'Shop' });
    expect(within(card).getByRole('link', { name: 'Shop' })).toHaveAttribute(
      'href',
      `/projects/${project.id}`,
    );
    expect(card).toHaveTextContent('https://github.com/acme/shop');
    expect(screen.getByRole('article', { name: 'Blog' })).toBeInTheDocument();
  });

  it('shows an empty state without projects', async () => {
    mockProjectsApi();
    renderApp('/projects');

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument();
  });

  it('shows the API error message and retries', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/projects'), () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { error: { code: 'internal_error', message: 'Database unavailable' } },
              { status: 500 },
            )
          : HttpResponse.json([]);
      }),
    );
    const { user } = renderApp('/projects');

    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });

  it('validates the form with the shared schema before sending anything', async () => {
    const api = mockProjectsApi();
    const { user } = renderApp('/projects');

    await user.click(await screen.findByRole('button', { name: 'New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.type(within(dialog).getByLabelText('Repository URL'), 'ftp://example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(await within(dialog).findByText('Required')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid http(s) URL')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(api.requests).toHaveLength(0);
  });

  it('creates a project and shows it in the list', async () => {
    const api = mockProjectsApi();
    const { user } = renderApp('/projects');

    await user.click(await screen.findByRole('button', { name: 'New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.type(within(dialog).getByLabelText('Name'), 'Shop');
    await user.type(within(dialog).getByLabelText('Description'), 'Online store');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('article', { name: 'Shop' })).toBeInTheDocument();
    // An empty repository URL is left out, not sent as "".
    expect(api.requests).toEqual([{ name: 'Shop', description: 'Online store' }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows validation errors returned by the API on their fields', async () => {
    mockProjectsApi();
    server.use(
      http.post(apiUrl('/projects'), () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Request validation failed',
              details: [{ path: ['body', 'name'], code: 'custom', message: 'Name is taken' }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp('/projects');

    await user.click(await screen.findByRole('button', { name: 'New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.type(within(dialog).getByLabelText('Name'), 'Shop');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(await within(dialog).findByText('Name is taken')).toBeInTheDocument();
  });

  it('keeps the project and shows the error when deleting fails', async () => {
    mockProjectsApi([projectFixture({ name: 'Shop' })]);
    server.use(
      http.delete(apiUrl('/projects/:id'), () =>
        HttpResponse.json(
          { error: { code: 'internal_error', message: 'Database unavailable' } },
          { status: 500 },
        ),
      ),
    );
    const { user } = renderApp('/projects');

    await user.click(await screen.findByRole('button', { name: 'Delete Shop' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete “Shop”?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete project' }));

    expect(
      await screen.findByText('Could not delete the project: Database unavailable'),
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Shop' })).toBeInTheDocument();
  });

  it('deletes a project only after confirmation', async () => {
    const api = mockProjectsApi([projectFixture({ name: 'Shop' })]);
    const { user } = renderApp('/projects');

    await user.click(await screen.findByRole('button', { name: 'Delete Shop' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete “Shop”?' });
    expect(api.projects).toHaveLength(1);
    await user.click(within(confirm).getByRole('button', { name: 'Delete project' }));

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(api.projects).toHaveLength(0);
  });
});

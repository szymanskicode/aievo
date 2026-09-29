import type { Schemas } from '@aievo/api-client';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { projectFixture } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

/** A tiny in-memory projects API; returns the list so tests can inspect writes. */
function mockProjectsApi(initial: Schemas['Project'][] = []) {
  const projects = [...initial];
  server.use(
    http.get(apiUrl('/projects'), () => HttpResponse.json(projects)),
    http.delete(apiUrl('/projects/:id'), ({ params }) => {
      const index = projects.findIndex((project) => project.id === params.id);
      projects.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { projects };
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
    expect(screen.getByRole('link', { name: 'New project' })).toHaveAttribute(
      'href',
      '/projects/new',
    );
  });

  it('links each project to its GitHub repository', async () => {
    mockProjectsApi([
      projectFixture({
        name: 'Shop',
        repoUrl: 'https://github.com/acme/shop',
        repoOwner: 'acme',
        repoName: 'shop',
      }),
    ]);
    renderApp('/projects');

    const card = await screen.findByRole('article', { name: 'Shop' });
    expect(within(card).getByRole('link', { name: 'acme/shop' })).toHaveAttribute(
      'href',
      'https://github.com/acme/shop',
    );
  });

  it('opens the project wizard from the header', async () => {
    mockProjectsApi([projectFixture({ name: 'Shop' })]);
    server.use(http.get(apiUrl('/git-credentials'), () => HttpResponse.json([])));
    const { user, router } = renderApp('/projects');

    await user.click(await screen.findByRole('link', { name: 'New project' }));

    expect(await screen.findByRole('heading', { name: 'New project' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects/new');
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

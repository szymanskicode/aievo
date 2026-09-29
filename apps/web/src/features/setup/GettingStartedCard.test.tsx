import type { Schemas } from '@aievo/api-client';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { setupStatusFixture } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

function mockStatus(status: Schemas['SetupStatus']) {
  server.use(http.get(apiUrl('/setup-status'), () => HttpResponse.json(status)));
}

beforeEach(() => {
  server.use(http.get(apiUrl('/projects'), () => HttpResponse.json([])));
});

describe('GettingStartedCard', () => {
  it('lists every open step with why it matters and where to do it', async () => {
    mockStatus(setupStatusFixture({ modelProvider: false, githubToken: false, project: false }));
    renderApp('/projects');

    const card = await screen.findByRole('region', { name: 'Getting started' });
    expect(card).toHaveTextContent('0 of 3 steps done');
    const steps = within(card).getAllByRole('listitem');
    expect(steps.map((step) => step.getAttribute('aria-label'))).toEqual([
      'Add a model provider',
      'Add a GitHub token',
      'Create a project',
    ]);
    expect(steps[1]).toHaveTextContent('push agent branches and open pull requests');
    expect(within(card).getByRole('link', { name: 'Open model providers' })).toHaveAttribute(
      'href',
      '/settings/providers',
    );
    expect(within(card).getByRole('link', { name: 'Open GitHub settings' })).toHaveAttribute(
      'href',
      '/settings/github',
    );
    expect(within(card).getByRole('link', { name: 'Create a project' })).toHaveAttribute(
      'href',
      '/projects/new',
    );
  });

  it('marks finished steps as done and drops their buttons', async () => {
    mockStatus(setupStatusFixture({ project: false }));
    renderApp('/projects');

    const card = await screen.findByRole('region', { name: 'Getting started' });
    expect(card).toHaveTextContent('2 of 3 steps done');
    const provider = within(card).getByRole('listitem', { name: 'Add a model provider' });
    expect(provider).toHaveTextContent('(done)');
    expect(within(provider).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).getByRole('listitem', { name: 'Create a project' })).toHaveTextContent(
      '(to do)',
    );
  });

  it('is gone once every step is done', async () => {
    mockStatus(setupStatusFixture());
    renderApp('/projects');

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Getting started' })).not.toBeInTheDocument();
  });

  it('takes the user to the provider settings', async () => {
    mockStatus(setupStatusFixture({ modelProvider: false }));
    server.use(
      http.get(apiUrl('/providers'), () => HttpResponse.json([])),
      http.get(apiUrl('/provider-types'), () => HttpResponse.json([])),
    );
    const { user, router } = renderApp('/projects');

    await user.click(await screen.findByRole('link', { name: 'Open model providers' }));

    expect(await screen.findByRole('heading', { name: 'Model providers' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings/providers');
  });
});

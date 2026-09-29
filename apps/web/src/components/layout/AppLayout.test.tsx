import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

describe('AppLayout', () => {
  beforeEach(() => {
    server.use(
      http.get(apiUrl('/projects'), () => HttpResponse.json([])),
      http.get(apiUrl('/providers'), () => HttpResponse.json([])),
      http.get(apiUrl('/provider-types'), () => HttpResponse.json([])),
    );
  });

  it('opens the projects page from the root URL', async () => {
    const { router } = renderApp('/');

    await screen.findByRole('heading', { name: 'Projects' });
    expect(router.state.location.pathname).toBe('/projects');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('navigates to the provider settings from the side menu', async () => {
    const { user, router } = renderApp('/projects');

    await user.click(await screen.findByRole('link', { name: 'Settings' }));

    await screen.findByRole('heading', { name: 'Model providers' });
    expect(router.state.location.pathname).toBe('/settings/providers');
  });

  it('marks Settings while a model provider or the GitHub token is missing', async () => {
    server.use(
      http.get(apiUrl('/setup-status'), () =>
        HttpResponse.json({ modelProvider: true, githubToken: false, project: false }),
      ),
    );
    renderApp('/projects');

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    const settings = await within(nav).findByRole('link', { name: /setup incomplete/ });
    expect(settings).toHaveAccessibleName(/^Settings\s*\(setup incomplete\)$/);
  });

  it('does not mark Settings when only the project is missing', async () => {
    server.use(
      http.get(apiUrl('/setup-status'), () =>
        HttpResponse.json({ modelProvider: true, githubToken: true, project: false }),
      ),
    );
    renderApp('/projects');

    await screen.findByRole('region', { name: 'Getting started' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('shows a not found page for unknown URLs', async () => {
    renderApp('/nope');

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});

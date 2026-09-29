import type { Schemas } from '@aievo/api-client';
import { providerTypeInfoList } from '@aievo/shared';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { modelFixture, providerFixture, workspaceSettingsFixture } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

const provider = providerFixture({ label: 'Anthropic' });
const sonnet = modelFixture({ providerId: provider.id, displayName: 'Claude Sonnet 5.5' });
const haiku = modelFixture({ providerId: provider.id, displayName: 'Claude Haiku 4.5' });
const disabled = modelFixture({
  providerId: provider.id,
  displayName: 'Old model',
  enabled: false,
});

let settings: Schemas['WorkspaceSettings'];
let patches: unknown[];

beforeEach(() => {
  settings = workspaceSettingsFixture({ coder: null });
  patches = [];
  server.use(
    http.get(apiUrl('/providers'), () => HttpResponse.json([provider])),
    http.get(apiUrl('/models'), () => HttpResponse.json([sonnet, haiku, disabled])),
    http.get(apiUrl('/workspace/settings'), () => HttpResponse.json(settings)),
    http.patch(apiUrl('/workspace/settings'), async ({ request }) => {
      const body = (await request.json()) as Schemas['UpdateWorkspaceSettings'];
      patches.push(body);
      settings = { agentModels: { coder: body.agentModels?.coder ?? null } };
      return HttpResponse.json(settings);
    }),
  );
});

describe('AgentModelsPage', () => {
  it('is linked from the settings', async () => {
    const { user, router } = renderApp('/settings/providers');

    await user.click(await screen.findByRole('link', { name: 'Models' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/models'));
  });

  it('saves the model chosen for the Programista from the enabled ones', async () => {
    const { user } = renderApp('/settings/models');
    const select = await screen.findByRole('combobox', { name: 'Model for Programista' });
    expect(select).toHaveTextContent('No model');

    await user.click(select);
    expect(screen.queryByRole('option', { name: /Old model/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Claude Haiku 4.5 (Anthropic)' }));

    await waitFor(() => expect(patches).toEqual([{ agentModels: { coder: haiku.id } }]));
    expect(await screen.findByText('Model of the Programista saved')).toBeInTheDocument();
    expect(select).toHaveTextContent('Claude Haiku 4.5 (Anthropic)');
  });

  it('clears the model', async () => {
    settings = workspaceSettingsFixture({ coder: sonnet.id });
    const { user } = renderApp('/settings/models');
    const select = await screen.findByRole('combobox', { name: 'Model for Programista' });
    expect(select).toHaveTextContent('Claude Sonnet 5.5 (Anthropic)');

    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'No model' }));

    await waitFor(() => expect(patches).toEqual([{ agentModels: { coder: null } }]));
  });

  it('shows why the API refused a model', async () => {
    server.use(
      http.patch(apiUrl('/workspace/settings'), () =>
        HttpResponse.json(
          { error: { code: 'model_not_usable', message: 'The model has no price' } },
          { status: 422 },
        ),
      ),
    );
    const { user } = renderApp('/settings/models');
    const select = await screen.findByRole('combobox', { name: 'Model for Programista' });

    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'Claude Sonnet 5.5 (Anthropic)' }));

    expect(await screen.findByText('The model has no price')).toBeInTheDocument();
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveTextContent('No model');
  });

  it('offers a model enabled on the providers page right after it', async () => {
    let models = [{ ...sonnet, enabled: false }];
    server.use(
      http.get(apiUrl('/provider-types'), () => HttpResponse.json(providerTypeInfoList)),
      http.get(apiUrl('/models'), () => HttpResponse.json(models)),
      http.patch(apiUrl('/models/:id'), async ({ request }) => {
        const body = (await request.json()) as { enabled: boolean };
        models = models.map((model) => ({ ...model, enabled: body.enabled }));
        return HttpResponse.json(models[0]);
      }),
    );
    const { user } = renderApp('/settings/models');
    expect(await screen.findByText('No enabled models yet')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open model providers' }));
    await user.click(await screen.findByRole('switch', { name: 'Claude Sonnet 5.5' }));
    await waitFor(() => expect(models[0]?.enabled).toBe(true));
    await user.click(screen.getByRole('link', { name: 'Models' }));

    await user.click(await screen.findByRole('combobox', { name: 'Model for Programista' }));
    expect(
      screen.getByRole('option', { name: 'Claude Sonnet 5.5 (Anthropic)' }),
    ).toBeInTheDocument();
  });

  it('points to the providers when no model is enabled', async () => {
    server.use(http.get(apiUrl('/models'), () => HttpResponse.json([disabled])));
    renderApp('/settings/models');

    expect(await screen.findByText('No enabled models yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open model providers' })).toHaveAttribute(
      'href',
      '/settings/providers',
    );
  });
});

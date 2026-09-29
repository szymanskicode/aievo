import type { Schemas } from '@aievo/api-client';
import { providerTypeInfoList } from '@aievo/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { modelFixture, providerFixture } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

// Not a real key: a recognizable value to search for after saving.
const FAKE_KEY = 'fake-test-key-never-shown-9876';

let providers: Schemas['Provider'][];
let models: Schemas['Model'][];
let requests: { path: string; body: unknown }[];

beforeEach(() => {
  providers = [];
  models = [];
  requests = [];
  server.use(
    http.get(apiUrl('/provider-types'), () => HttpResponse.json(providerTypeInfoList)),
    http.get(apiUrl('/providers'), () => HttpResponse.json(providers)),
    http.post(apiUrl('/providers'), async ({ request }) => {
      const body = (await request.json()) as Schemas['CreateProvider'];
      requests.push({ path: '/providers', body });
      // Like the API: only the last four characters come back.
      const provider = providerFixture({
        type: body.type,
        label: body.label,
        hasKey: body.apiKey !== undefined,
        keyHint: body.apiKey?.slice(-4) ?? null,
        baseUrl: body.baseUrl ?? null,
      });
      providers.push(provider);
      return HttpResponse.json(provider, { status: 201 });
    }),
    http.get(apiUrl('/models'), ({ request }) => {
      const providerId = new URL(request.url).searchParams.get('providerId');
      return HttpResponse.json(models.filter((model) => model.providerId === providerId));
    }),
  );
});

describe('ProvidersPage', () => {
  it('shows an empty state without providers', async () => {
    renderApp('/settings/providers');

    expect(await screen.findByText('No model providers yet')).toBeInTheDocument();
  });

  it('does not offer the form when the API reports no provider types', async () => {
    server.use(http.get(apiUrl('/provider-types'), () => HttpResponse.json([])));
    renderApp('/settings/providers');

    expect(await screen.findByText(/reports no supported provider types/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add provider' })).not.toBeInTheDocument();
  });

  it('shows the API error when providers cannot be loaded', async () => {
    server.use(
      http.get(apiUrl('/providers'), () =>
        HttpResponse.json(
          { error: { code: 'internal_error', message: 'Database unavailable' } },
          { status: 500 },
        ),
      ),
    );
    renderApp('/settings/providers');

    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
  });

  it('adds a provider and never shows its key afterwards', async () => {
    const { user, queryClient } = renderApp('/settings/providers');

    await user.click(await screen.findByRole('button', { name: 'Add provider' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add model provider' });
    expect(within(dialog).getByLabelText('API key')).toHaveAttribute('type', 'password');
    await user.type(within(dialog).getByLabelText('Name'), 'Work Anthropic');
    await user.type(within(dialog).getByLabelText('API key'), FAKE_KEY);
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }));

    const card = await screen.findByRole('article', { name: 'Work Anthropic' });
    expect(requests).toEqual([
      {
        path: '/providers',
        body: { type: 'anthropic', label: 'Work Anthropic', apiKey: FAKE_KEY },
      },
    ]);
    expect(card).toHaveTextContent('Key ••••9876');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Not in the page: text, attributes or input values.
    expect(document.documentElement.outerHTML).not.toContain(FAKE_KEY);
    for (const input of document.querySelectorAll('input')) {
      expect(input.value).not.toContain(FAKE_KEY);
    }
    // Not kept in memory by the query or mutation cache either.
    await waitFor(() => {
      const cached = JSON.stringify([
        queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
        queryClient
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.variables),
      ]);
      expect(cached).not.toContain(FAKE_KEY);
    });
  });

  it('asks for the fields that the chosen provider type requires', async () => {
    const { user } = renderApp('/settings/providers');

    await user.click(await screen.findByRole('button', { name: 'Add provider' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add model provider' });
    await user.click(within(dialog).getByLabelText('Type'));
    await user.click(await screen.findByRole('option', { name: /OpenAI-compatible/ }));

    expect(within(dialog).getByLabelText('API key (optional)')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Name'), 'Local Ollama');
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }));

    expect(
      await within(dialog).findByText('Required for provider type openai-compatible'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Base URL')).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toEqual([]);
  });

  it('tests the connection and lists the discovered models with their capabilities', async () => {
    const provider = providerFixture({ label: 'Work Anthropic' });
    providers.push(provider);
    server.use(
      http.post(apiUrl(`/providers/${provider.id}/test`), () => {
        models.push(modelFixture({ providerId: provider.id, displayName: 'Claude Sonnet 5.5' }));
        return HttpResponse.json({ discovered: 1, models });
      }),
    );
    const { user } = renderApp('/settings/providers');

    const card = await screen.findByRole('article', { name: 'Work Anthropic' });
    expect(await within(card).findByText(/No models yet/)).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Test connection' }));

    expect(await screen.findByText('Connection works: 1 model found')).toBeInTheDocument();
    const model = within(card).getByRole('listitem', { name: 'Claude Sonnet 5.5' });
    expect(model).toHaveTextContent('Tools');
    expect(model).toHaveTextContent('Vision');
    expect(model).not.toHaveTextContent('Reasoning');
    expect(model).toHaveTextContent('200k context');
    expect(within(model).getByRole('switch', { name: 'Claude Sonnet 5.5' })).toBeChecked();
  });

  it('shows why the connection test failed', async () => {
    const provider = providerFixture({ label: 'Work Anthropic' });
    providers.push(provider);
    server.use(
      http.post(apiUrl(`/providers/${provider.id}/test`), () =>
        HttpResponse.json(
          { error: { code: 'provider_auth_failed', message: 'The provider rejected the API key' } },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp('/settings/providers');

    const card = await screen.findByRole('article', { name: 'Work Anthropic' });
    await user.click(within(card).getByRole('button', { name: 'Test connection' }));

    expect(await within(card).findByRole('alert')).toHaveTextContent(
      'The provider rejected the API key',
    );
  });

  it('switches a model back and shows the error when the API rejects the change', async () => {
    const provider = providerFixture({ label: 'Work Anthropic' });
    const model = modelFixture({ providerId: provider.id, displayName: 'Claude Sonnet 5.5' });
    providers.push(provider);
    models.push(model);
    let respond = () => {};
    const answered = new Promise<void>((resolve) => (respond = resolve));
    let rejected = false;
    server.use(
      // After the failed PATCH the list is refetched; holding that answer back proves the
      // switch comes back from the rollback, not from fresh data.
      http.get(apiUrl('/models'), async () => {
        if (rejected) await delay('infinite');
        return HttpResponse.json(models);
      }),
      http.patch(apiUrl(`/models/${model.id}`), async () => {
        await answered;
        rejected = true;
        return HttpResponse.json(
          { error: { code: 'internal_error', message: 'Database unavailable' } },
          { status: 500 },
        );
      }),
    );
    const { user } = renderApp('/settings/providers');

    const toggle = await screen.findByRole('switch', { name: 'Claude Sonnet 5.5' });
    await user.click(toggle);
    expect(toggle).not.toBeChecked();

    respond();

    expect(
      await screen.findByText('Could not update the model: Database unavailable'),
    ).toBeInTheDocument();
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('deletes a provider only after confirmation', async () => {
    const provider = providerFixture({ label: 'Work Anthropic' });
    providers.push(provider);
    server.use(
      http.delete(apiUrl(`/providers/${provider.id}`), () => {
        requests.push({ path: `/providers/${provider.id}`, body: null });
        providers.splice(providers.indexOf(provider), 1);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp('/settings/providers');

    await user.click(await screen.findByRole('button', { name: 'Delete Work Anthropic' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete “Work Anthropic”?' });
    expect(requests).toEqual([]);
    await user.click(within(confirm).getByRole('button', { name: 'Delete provider' }));

    expect(await screen.findByText('No model providers yet')).toBeInTheDocument();
    expect(requests).toEqual([{ path: `/providers/${provider.id}`, body: null }]);
  });

  it('turns a model off', async () => {
    const provider = providerFixture({ label: 'Work Anthropic' });
    const model = modelFixture({ providerId: provider.id, displayName: 'Claude Sonnet 5.5' });
    providers.push(provider);
    models.push(model);
    server.use(
      http.patch(apiUrl(`/models/${model.id}`), async ({ request }) => {
        const body = (await request.json()) as Schemas['UpdateModel'];
        requests.push({ path: `/models/${model.id}`, body });
        Object.assign(model, body);
        return HttpResponse.json(model);
      }),
    );
    const { user } = renderApp('/settings/providers');

    const toggle = await screen.findByRole('switch', { name: 'Claude Sonnet 5.5' });
    await user.click(toggle);

    expect(toggle).not.toBeChecked();
    await waitFor(() =>
      expect(requests).toEqual([{ path: `/models/${model.id}`, body: { enabled: false } }]),
    );
  });
});

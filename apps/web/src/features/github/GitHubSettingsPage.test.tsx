import type { Schemas } from '@aievo/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { gitCredentialFixture } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

import { NEW_TOKEN_URL } from './TokenInstructions';

// Not a real token: a recognizable value to search for after saving.
const FAKE_TOKEN = 'github_pat_fake_test_token_never_shown_4321';

let credentials: Schemas['GitCredential'][];
let requests: unknown[];

beforeEach(() => {
  credentials = [];
  requests = [];
  server.use(
    http.get(apiUrl('/git-credentials'), () => HttpResponse.json(credentials)),
    http.post(apiUrl('/git-credentials'), async ({ request }) => {
      const body = (await request.json()) as Schemas['CreateGitCredential'];
      requests.push(body);
      const credential = gitCredentialFixture({
        label: body.label,
        tokenHint: body.token.slice(-4),
        expiresAt: null,
      });
      credentials.push(credential);
      return HttpResponse.json(
        { ...credential, warnings: ['The token has no expiration date.'] },
        { status: 201 },
      );
    }),
    http.delete(apiUrl('/git-credentials/:id'), ({ params }) => {
      credentials = credentials.filter((credential) => credential.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

async function addToken(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Add token' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add GitHub token' });
  await user.type(within(dialog).getByLabelText('Token'), FAKE_TOKEN);
  await user.click(within(dialog).getByRole('button', { name: 'Add token' }));
  return dialog;
}

describe('GitHubSettingsPage', () => {
  it('is a settings section next to the model providers', async () => {
    const { user, router } = renderApp('/settings/providers');
    server.use(
      http.get(apiUrl('/providers'), () => HttpResponse.json([])),
      http.get(apiUrl('/provider-types'), () => HttpResponse.json([])),
    );

    const nav = await screen.findByRole('navigation', { name: 'Settings' });
    await user.click(within(nav).getByRole('link', { name: 'GitHub' }));

    expect(await screen.findByRole('heading', { name: 'GitHub' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings/github');
    expect(within(nav).getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('explains step by step how to create the token', async () => {
    renderApp('/settings/github');

    const instructions = await screen.findByRole('region', { name: 'How to create the token' });
    expect(
      within(instructions).getByRole('link', { name: /New fine-grained token on GitHub/ }),
    ).toHaveAttribute('href', NEW_TOKEN_URL);
    for (const permission of ['Administration', 'Contents', 'Pull requests', 'Metadata']) {
      expect(within(instructions).getByText(permission)).toBeInTheDocument();
    }
    expect(within(instructions).getByText('All repositories')).toBeInTheDocument();
  });

  it('adds a token, shows its login and expiry and the warnings from saving', async () => {
    const { user } = renderApp('/settings/github');

    expect(await screen.findByText('No GitHub token yet')).toBeInTheDocument();
    await addToken(user);

    const card = await screen.findByRole('article', { name: 'GitHub' });
    expect(card).toHaveTextContent('octocat');
    expect(card).toHaveTextContent('••••4321');
    expect(card).toHaveTextContent('No expiration date');
    expect(screen.getByText('The token has no expiration date.')).toBeInTheDocument();
    expect(requests).toEqual([{ label: 'GitHub', token: FAKE_TOKEN }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body).not.toHaveTextContent(FAKE_TOKEN);
  });

  it('shows why GitHub rejected the token and keeps the dialog open', async () => {
    server.use(
      http.post(apiUrl('/git-credentials'), () =>
        HttpResponse.json(
          { error: { code: 'git_auth_failed', message: 'GitHub rejected the token' } },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp('/settings/github');

    const dialog = await addToken(user);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('GitHub rejected the token');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('validates the form before sending anything', async () => {
    const { user } = renderApp('/settings/github');

    await user.click(await screen.findByRole('button', { name: 'Add token' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add GitHub token' });
    await user.click(within(dialog).getByRole('button', { name: 'Add token' }));

    expect(await within(dialog).findByText('Required')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('flags an expired token', async () => {
    credentials = [gitCredentialFixture({ expiresAt: '2020-01-01T00:00:00.000Z' })];
    renderApp('/settings/github');

    const card = await screen.findByRole('article', { name: 'GitHub' });
    expect(within(card).getByText('Expired')).toBeInTheDocument();
    expect(card).toHaveTextContent('2020-01-01');
  });

  it('deletes a token after confirmation', async () => {
    credentials = [gitCredentialFixture()];
    const { user } = renderApp('/settings/github');

    await user.click(await screen.findByRole('button', { name: 'Delete GitHub' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete “GitHub”?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete token' }));

    expect(await screen.findByText('No GitHub token yet')).toBeInTheDocument();
    expect(credentials).toEqual([]);
  });

  it('keeps a token that a project still uses and says why', async () => {
    credentials = [gitCredentialFixture()];
    server.use(
      http.delete(apiUrl('/git-credentials/:id'), () =>
        HttpResponse.json(
          {
            error: {
              code: 'git_credential_in_use',
              message: 'The token is used by a project',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderApp('/settings/github');

    await user.click(await screen.findByRole('button', { name: 'Delete GitHub' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete “GitHub”?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete token' }));

    expect(
      await screen.findByText('Could not delete the token: The token is used by a project'),
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'GitHub' })).toBeInTheDocument();
  });
});

import type { Schemas } from '@aievo/api-client';
import { DEFAULT_NPM_COMMANDS } from '@aievo/shared';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  gitCredentialFixture,
  githubRepoFixture,
  projectFixture,
  templateFixture,
} from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiUrl, server } from '@/test/server';

const credential = gitCredentialFixture();
const templates = [
  templateFixture('empty', { name: 'Empty project', description: 'Only a README' }),
  templateFixture('react-vite-ts', {
    name: 'React + Vite + TypeScript + Vitest',
    description: 'SPA with tests',
    commands: { install: 'npm install', test: 'npm test' },
  }),
];

let requests: Schemas['CreateProject'][];
let created: Schemas['Project'] | undefined;

beforeEach(() => {
  requests = [];
  created = undefined;
  server.use(
    http.get(apiUrl('/git-credentials'), () => HttpResponse.json([credential])),
    http.get(apiUrl('/github/owners'), () =>
      HttpResponse.json([
        { login: 'octocat', type: 'user', avatarUrl: null },
        { login: 'acme', type: 'organization', avatarUrl: null },
      ]),
    ),
    http.get(apiUrl('/github/repos'), ({ request }) => {
      const owner = new URL(request.url).searchParams.get('owner') ?? '';
      return HttpResponse.json([
        githubRepoFixture({ owner, name: 'blog', defaultBranch: 'main' }),
        githubRepoFixture({ owner, name: 'shop', defaultBranch: 'develop', description: 'Store' }),
      ]);
    }),
    http.get(apiUrl('/templates'), () => HttpResponse.json(templates)),
    http.post(apiUrl('/projects'), async ({ request }) => {
      const body = (await request.json()) as Schemas['CreateProject'];
      requests.push(body);
      const name = body.mode === 'new' ? body.name : (body.name ?? body.repo);
      created = projectFixture({ name });
      return HttpResponse.json(created, { status: 201 });
    }),
    http.get(apiUrl('/projects/:id'), () => HttpResponse.json(created)),
    http.get(apiUrl('/projects/:id/tasks'), () => HttpResponse.json([])),
  );
});

type User = ReturnType<typeof renderApp>['user'];

async function choose(user: User, mode: RegExp) {
  await user.click(await screen.findByRole('radio', { name: mode }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

describe('ProjectWizardPage', () => {
  it('sends the user to the GitHub settings when no token is stored', async () => {
    server.use(http.get(apiUrl('/git-credentials'), () => HttpResponse.json([])));
    renderApp('/projects/new');

    expect(await screen.findByText('Add a GitHub token first')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open GitHub settings' })).toHaveAttribute(
      'href',
      '/settings/github',
    );
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('creates a new private repository from the React template by default', async () => {
    const { user, router } = renderApp('/projects/new');

    await choose(user, /Create a new repository/);
    const form = await screen.findByRole('form', { name: 'New repository' });
    expect(await within(form).findByRole('combobox', { name: 'Owner' })).toHaveTextContent(
      'octocat',
    );
    expect(within(form).getByRole('radio', { name: /Private/ })).toBeChecked();
    expect(within(form).getByRole('radio', { name: /React \+ Vite/ })).toBeChecked();
    expect(within(form).getByText('SPA with tests')).toBeInTheDocument();
    await user.type(within(form).getByLabelText('Repository name'), 'aievo-playground');
    await user.type(within(form).getByLabelText('Description (optional)'), 'For agents');
    await user.click(within(form).getByRole('button', { name: 'Next' }));

    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(summary).toHaveTextContent('octocat/aievo-playground (new, private)');
    expect(summary).toHaveTextContent('React + Vite + TypeScript + Vitest');
    expect(summary).toHaveTextContent('npm install');
    await user.click(within(summary).getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('heading', { name: 'aievo-playground' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/projects/${created?.id}`);
    expect(requests).toEqual([
      {
        mode: 'new',
        credentialId: credential.id,
        name: 'aievo-playground',
        description: 'For agents',
        owner: 'octocat',
        private: true,
        template: 'react-vite-ts',
      },
    ]);
  });

  it('validates the new repository with the shared schema before sending anything', async () => {
    const { user } = renderApp('/projects/new');

    await choose(user, /Create a new repository/);
    const form = await screen.findByRole('form', { name: 'New repository' });
    await within(form).findByRole('combobox', { name: 'Owner' });
    await user.click(within(form).getByRole('button', { name: 'Next' }));
    expect(await within(form).findByText('Required')).toBeInTheDocument();

    await user.type(within(form).getByLabelText('Repository name'), 'has space');
    await user.click(within(form).getByRole('button', { name: 'Next' }));
    expect(
      await within(form).findByText('Use letters, digits, ".", "-" or "_" (at most 100)'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Summary' })).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('connects an existing repository found by search with editable commands', async () => {
    const { user } = renderApp('/projects/new');

    await choose(user, /Connect an existing repository/);
    const form = await screen.findByRole('form', { name: 'Existing repository' });
    await user.type(
      await within(form).findByRole('searchbox', { name: 'Search repositories' }),
      'sh',
    );
    expect(within(form).queryByRole('radio', { name: /blog/ })).not.toBeInTheDocument();
    await user.click(within(form).getByRole('radio', { name: /shop/ }));
    expect(within(form).getByLabelText('Base branch')).toHaveValue('develop');
    expect(within(form).getByLabelText('Test')).toHaveValue(DEFAULT_NPM_COMMANDS.test);
    await user.clear(within(form).getByLabelText('Test'));
    await user.type(within(form).getByLabelText('Test'), 'npm run test:unit');
    await user.clear(within(form).getByLabelText('Dev server'));
    await user.click(within(form).getByRole('button', { name: 'Next' }));

    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(summary).toHaveTextContent('octocat/shop (existing)');
    await user.click(within(summary).getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('heading', { name: 'shop' })).toBeInTheDocument();
    expect(requests).toEqual([
      {
        mode: 'existing',
        credentialId: credential.id,
        owner: 'octocat',
        repo: 'shop',
        defaultBranch: 'develop',
        commands: {
          install: DEFAULT_NPM_COMMANDS.install,
          build: DEFAULT_NPM_COMMANDS.build,
          lint: DEFAULT_NPM_COMMANDS.lint,
          test: 'npm run test:unit',
          coverage: DEFAULT_NPM_COMMANDS.coverage,
        },
      },
    ]);
  });

  it('takes the base branch of the repository that was clicked', async () => {
    const { user } = renderApp('/projects/new');

    await choose(user, /Connect an existing repository/);
    const form = await screen.findByRole('form', { name: 'Existing repository' });
    const branch = () => within(form).getByLabelText('Base branch');

    await user.click(await within(form).findByRole('radio', { name: /shop/ }));
    expect(branch()).toHaveValue('develop');
    await user.click(within(form).getByRole('radio', { name: /blog/ }));
    expect(branch()).toHaveValue('main');
    expect(within(form).getByRole('radio', { name: /blog/ })).toBeChecked();
    expect(within(form).getByRole('radio', { name: /shop/ })).not.toBeChecked();
  });

  it('asks to choose a repository', async () => {
    const { user } = renderApp('/projects/new');

    await choose(user, /Connect an existing repository/);
    const form = await screen.findByRole('form', { name: 'Existing repository' });
    await within(form).findByRole('radio', { name: /blog/ });
    await user.click(within(form).getByRole('button', { name: 'Next' }));

    const repositories = within(form).getByRole('group', { name: 'Repository' });
    expect(await within(repositories).findByText('Required')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('keeps what was entered when going back from the summary', async () => {
    const { user } = renderApp('/projects/new');

    await choose(user, /Create a new repository/);
    const form = await screen.findByRole('form', { name: 'New repository' });
    await within(form).findByRole('combobox', { name: 'Owner' });
    await user.type(within(form).getByLabelText('Repository name'), 'kept');
    await user.click(within(form).getByRole('radio', { name: /Public/ }));
    await user.click(within(form).getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));

    const again = await screen.findByRole('form', { name: 'New repository' });
    expect(within(again).getByLabelText('Repository name')).toHaveValue('kept');
    expect(within(again).getByRole('radio', { name: /Public/ })).toBeChecked();
  });

  it('links the repository when it was created but the project was not', async () => {
    server.use(
      http.post(apiUrl('/projects'), () =>
        HttpResponse.json(
          {
            error: {
              code: 'project_setup_failed',
              message: 'Repository octocat/app was created, but the initial commit failed.',
              details: { repoUrl: 'https://github.com/octocat/app', step: 'initial_commit' },
            },
          },
          { status: 502 },
        ),
      ),
    );
    const { user, router } = renderApp('/projects/new');

    await choose(user, /Create a new repository/);
    const form = await screen.findByRole('form', { name: 'New repository' });
    await within(form).findByRole('combobox', { name: 'Owner' });
    await user.type(within(form).getByLabelText('Repository name'), 'app');
    await user.click(within(form).getByRole('button', { name: 'Next' }));
    const summary = await screen.findByRole('region', { name: 'Summary' });
    await user.click(within(summary).getByRole('button', { name: 'Create project' }));

    const alert = await within(summary).findByRole('alert');
    expect(alert).toHaveTextContent('the initial commit failed');
    expect(within(alert).getByRole('link', { name: /Open the repository/ })).toHaveAttribute(
      'href',
      'https://github.com/octocat/app',
    );
    expect(router.state.location.pathname).toBe('/projects/new');
  });

  it('asks which token to use when several are stored', async () => {
    const second = gitCredentialFixture({ label: 'Work', githubLogin: 'acme-bot' });
    server.use(http.get(apiUrl('/git-credentials'), () => HttpResponse.json([credential, second])));
    renderApp('/projects/new');

    expect(await screen.findByRole('combobox', { name: 'GitHub token' })).toHaveTextContent(
      'GitHub (octocat)',
    );
  });
});

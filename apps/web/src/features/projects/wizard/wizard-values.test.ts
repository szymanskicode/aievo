import { describe, expect, it } from 'vitest';

import { projectName, toRequestBody } from './wizard-values';

describe('toRequestBody', () => {
  it('leaves out empty fields, also among the commands', () => {
    expect(
      toRequestBody({
        mode: 'existing',
        owner: 'octocat',
        repo: 'hello',
        defaultBranch: 'main',
        name: undefined,
        commands: { install: 'npm install', dev: undefined },
      }),
    ).toEqual({
      mode: 'existing',
      owner: 'octocat',
      repo: 'hello',
      defaultBranch: 'main',
      commands: { install: 'npm install' },
    });
  });

  it('keeps a new repository as entered', () => {
    expect(
      toRequestBody({
        mode: 'new',
        name: 'app',
        owner: 'octocat',
        private: true,
        template: 'empty',
        description: undefined,
      }),
    ).toEqual({ mode: 'new', name: 'app', owner: 'octocat', private: true, template: 'empty' });
  });
});

describe('projectName', () => {
  it('defaults to the repository name for an existing repository', () => {
    const base = { mode: 'existing', owner: 'o', repo: 'hello', defaultBranch: 'main' } as const;
    expect(projectName(base)).toBe('hello');
    expect(projectName({ ...base, name: 'Hello app' })).toBe('Hello app');
  });
});

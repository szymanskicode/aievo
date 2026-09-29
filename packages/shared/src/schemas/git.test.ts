import { describe, expect, it } from 'vitest';

import {
  createGitCredentialSchema,
  createdGitCredentialSchema,
  gitCredentialSchema,
  githubCredentialQuerySchema,
  githubReposQuerySchema,
} from './git.js';

const credential = {
  id: '00000000-0000-4000-8000-000000000001',
  provider: 'github',
  label: 'GitHub',
  tokenHint: 'abcd',
  githubLogin: 'octocat',
  expiresAt: null,
  createdAt: '2026-09-29T10:00:00.000Z',
  updatedAt: '2026-09-29T10:00:00.000Z',
};

describe('createGitCredentialSchema', () => {
  it('trims the label and the token', () => {
    expect(createGitCredentialSchema.parse({ label: ' GitHub ', token: ' t0ken ' })).toEqual({
      label: 'GitHub',
      token: 't0ken',
    });
  });

  it('rejects empty values and unknown fields', () => {
    expect(createGitCredentialSchema.safeParse({ label: 'GitHub', token: '  ' }).success).toBe(
      false,
    );
    expect(
      createGitCredentialSchema.safeParse({ label: 'GitHub', token: 't', provider: 'github' })
        .success,
    ).toBe(false);
  });
});

describe('gitCredentialSchema', () => {
  it('never carries the token', () => {
    const parsed = gitCredentialSchema.parse({
      ...credential,
      token: 'secret',
      encryptedToken: 'v1:x',
    });
    expect(parsed).not.toHaveProperty('token');
    expect(parsed).not.toHaveProperty('encryptedToken');
  });

  it('extends the credential with warnings on creation', () => {
    expect(createdGitCredentialSchema.parse({ ...credential, warnings: ['w'] }).warnings).toEqual([
      'w',
    ]);
  });
});

describe('github query schemas', () => {
  it('makes the credential optional', () => {
    expect(githubCredentialQuerySchema.parse({})).toEqual({});
    expect(githubCredentialQuerySchema.safeParse({ credentialId: 'nope' }).success).toBe(false);
  });

  it('accepts valid GitHub logins only', () => {
    expect(githubReposQuerySchema.parse({ owner: 'my-org-1' }).owner).toBe('my-org-1');
    for (const owner of ['', '-org', 'org-', 'a--b', 'a/b', 'a'.repeat(40), '../x']) {
      expect(githubReposQuerySchema.safeParse({ owner }).success, owner).toBe(false);
    }
  });
});

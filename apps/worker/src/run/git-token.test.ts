import { closeTestDb } from '@aievo/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { setupRun } from '../test/fixtures.js';
import type { RunFixture } from '../test/fixtures.js';
import { createGitTokenOpener } from './git-token.js';
import { RunFailure } from './run-failure.js';

let fx: RunFixture;

beforeEach(async () => {
  fx = await setupRun();
});

afterAll(closeTestDb);

describe('createGitTokenOpener', () => {
  it('decrypts the token of a credential in the workspace', async () => {
    const open = createGitTokenOpener(fx.db, fx.secretBox);

    expect(await open(fx.workspaceId, fx.project.gitCredentialId!)).toBe(fx.token);
  });

  it('fails a run when the credential is gone', async () => {
    const open = createGitTokenOpener(fx.db, fx.secretBox);

    const error = await open(fx.workspaceId, '00000000-0000-4000-8000-000000000000').catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(RunFailure);
    expect(error).toMatchObject({ code: 'git_credential_missing' });
  });
});

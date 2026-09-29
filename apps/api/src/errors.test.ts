import { DuplicateRowError } from '@aievo/db';
import { GitError } from '@aievo/git';
import type { GitErrorKind } from '@aievo/git';
import { ProviderError } from '@aievo/llm';
import type { ProviderErrorKind } from '@aievo/llm';
import { DecryptionError } from '@aievo/shared/crypto';
import { describe, expect, it } from 'vitest';

import { toApiError } from './errors.js';

describe('toApiError: provider errors', () => {
  it.each([
    ['unauthorized', 400, 'provider_auth_failed'],
    ['forbidden', 400, 'provider_auth_failed'],
    ['rate_limited', 429, 'provider_rate_limited'],
    ['timeout', 504, 'provider_timeout'],
    ['network', 502, 'provider_unavailable'],
    ['unavailable', 502, 'provider_unavailable'],
    ['not_found', 502, 'provider_bad_response'],
    ['bad_response', 502, 'provider_bad_response'],
  ] as [ProviderErrorKind, number, string][])('maps %s to %i %s', (kind, status, code) => {
    const error = toApiError(new ProviderError(kind));

    expect(error.status).toBe(status);
    expect(error.toBody()).toEqual({ error: { code, message: new ProviderError(kind).message } });
  });

  it('adds only the provider status to the details', () => {
    expect(toApiError(new ProviderError('unavailable', 503)).details).toEqual({
      providerStatus: 503,
    });
  });
});

describe('toApiError: decryption errors', () => {
  it('hides them behind a generic server error', () => {
    expect(toApiError(new DecryptionError('Secret cannot be decrypted')).toBody()).toEqual({
      error: { code: 'internal_error', message: 'Unexpected server error' },
    });
  });
});

describe('toApiError: Git errors', () => {
  it.each([
    ['unauthorized', 400, 'git_auth_failed'],
    ['forbidden', 400, 'git_permission_denied'],
    ['not_found', 404, 'git_not_found'],
    ['rate_limited', 429, 'git_rate_limited'],
    ['already_exists', 409, 'git_already_exists'],
    ['repo_not_empty', 409, 'git_repo_not_empty'],
    ['conflict', 409, 'git_conflict'],
    ['validation', 400, 'git_validation_failed'],
    ['unavailable', 502, 'git_unavailable'],
    ['network', 502, 'git_unavailable'],
    ['timeout', 504, 'git_timeout'],
    ['bad_response', 502, 'git_bad_response'],
  ] as [GitErrorKind, number, string][])('maps %s to %i %s', (kind, status, code) => {
    const error = toApiError(new GitError(kind));

    expect(error.status).toBe(status);
    expect(error.toBody()).toEqual({ error: { code, message: new GitError(kind).message } });
  });

  it('passes on the GitHub status, reset time and required permissions', () => {
    const error = toApiError(
      new GitError('forbidden', { status: 403, requiredPermissions: ['contents=write'] }),
    );
    expect(error.details).toEqual({ githubStatus: 403, requiredPermissions: ['contents=write'] });

    const limited = toApiError(
      new GitError('rate_limited', { status: 429, resetAt: '2026-09-29T12:00:00.000Z' }),
    );
    expect(limited.details).toEqual({ githubStatus: 429, resetAt: '2026-09-29T12:00:00.000Z' });
  });
});

describe('toApiError: repository errors', () => {
  it('turns a duplicate row into a 409 with the repository message', () => {
    const error = toApiError(new DuplicateRowError('Another project already uses this repository'));

    expect(error.status).toBe(409);
    expect(error.toBody()).toEqual({
      error: { code: 'conflict', message: 'Another project already uses this repository' },
    });
  });
});

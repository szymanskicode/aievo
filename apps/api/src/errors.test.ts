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

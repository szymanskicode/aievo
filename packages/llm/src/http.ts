import { providerTypeInfo } from '@aievo/shared';

import { ProviderError, providerErrorFromStatus } from './errors.js';
import { DEFAULT_TIMEOUT_MS } from './types.js';
import type { ProviderCredentialInput, RequestOptions } from './types.js';

/** The credential's base URL or the type's default, without a trailing slash. */
export function resolveBaseUrl(credential: ProviderCredentialInput): string {
  const baseUrl = credential.baseUrl ?? providerTypeInfo[credential.type].defaultBaseUrl;
  if (!baseUrl) {
    // Request validation requires it, so this is a programming error, not a user one.
    throw new Error(`Provider type ${credential.type} needs a base URL`);
  }
  return baseUrl.replace(/\/+$/, '');
}

/**
 * GET a JSON document from a provider. Every failure becomes a `ProviderError`,
 * so no response body, header or URL can travel further up.
 */
export async function getJson(
  url: string,
  headers: Record<string, string>,
  { signal, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', ...headers },
      signal: combined,
      // A cross-origin redirect would forward custom headers such as `x-api-key` to the new
      // host. Redirects are never followed; a 3xx fails below like any non-2xx answer.
      redirect: 'manual',
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ProviderError(timeout.aborted ? 'timeout' : 'network');
  }

  if (!response.ok) {
    // Frees the connection; the body is never read, it may echo the request or the key.
    // Not awaited: some streams settle the cancellation only after the body is drained.
    response.body?.cancel().catch(() => undefined);
    throw providerErrorFromStatus(response.status);
  }

  try {
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ProviderError(timeout.aborted ? 'timeout' : 'bad_response');
  }
}

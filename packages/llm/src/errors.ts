export type ProviderErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'unavailable'
  | 'timeout'
  | 'network'
  | 'bad_response';

const MESSAGES: Record<ProviderErrorKind, string> = {
  unauthorized: 'The provider rejected the API key',
  forbidden: 'The API key has no access to this resource',
  not_found: 'The provider endpoint was not found; check the base URL',
  rate_limited: 'The provider rate limit was exceeded; try again later',
  unavailable: 'The provider is temporarily unavailable',
  timeout: 'The provider did not respond in time',
  network: 'Cannot reach the provider; check the base URL and the network',
  bad_response: 'The provider returned an unexpected response',
};

/**
 * A failed call to a model provider, reduced to a readable, fixed message.
 * It deliberately carries no response body, headers or request details: those can
 * contain the key or echo the request, and the message goes straight to the API client.
 */
export class ProviderError extends Error {
  override name = 'ProviderError';

  constructor(
    readonly kind: ProviderErrorKind,
    /** HTTP status of the provider response, when there was one. */
    readonly status?: number,
  ) {
    super(MESSAGES[kind]);
  }
}

export function providerErrorFromStatus(status: number): ProviderError {
  if (status === 401) return new ProviderError('unauthorized', status);
  if (status === 403) return new ProviderError('forbidden', status);
  if (status === 404) return new ProviderError('not_found', status);
  if (status === 408) return new ProviderError('timeout', status);
  if (status === 429) return new ProviderError('rate_limited', status);
  if (status >= 500) return new ProviderError('unavailable', status);
  return new ProviderError('bad_response', status);
}

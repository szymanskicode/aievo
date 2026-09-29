/**
 * An error response of the API (`{ error: { code, message, details? } }`) or a failure to
 * reach it at all (`status: 0`, `code: 'network_error'`).
 */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

/** Builds the error for a non-2xx response, even when its body is not in the API format. */
function toApiClientError(response: Response, body: unknown): ApiClientError {
  if (isApiErrorBody(body)) {
    const { code, message, details } = body.error;
    return new ApiClientError(response.status, code, message, details);
  }
  return new ApiClientError(
    response.status,
    'unexpected_response',
    `Unexpected response from the API (HTTP ${response.status})`,
  );
}

/** What every openapi-fetch call resolves to. */
interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * Resolves to the response data or throws `ApiClientError` for API errors and unreachable
 * servers. Anything else (an aborted request, a 2xx body that is not JSON) is rethrown
 * unchanged, so it is not mistaken for a network failure and retried.
 */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await request;
  } catch (error) {
    // `fetch` rejects with a TypeError when no response arrives at all.
    if (!(error instanceof TypeError)) throw error;
    throw new ApiClientError(0, 'network_error', 'Cannot reach the API. Is it running?');
  }

  if (!result.response.ok) throw toApiClientError(result.response, result.error);
  // 204 responses have no body: openapi-fetch returns `data: undefined` for them.
  return result.data as T;
}

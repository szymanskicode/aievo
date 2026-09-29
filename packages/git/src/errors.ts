export type GitErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'already_exists'
  | 'repo_not_empty'
  | 'conflict'
  | 'validation'
  | 'unavailable'
  | 'timeout'
  | 'network'
  | 'bad_response';

const MESSAGES: Record<GitErrorKind, string> = {
  unauthorized: 'GitHub rejected the token; it may be invalid, revoked or expired',
  forbidden: 'The token lacks a permission required for this operation',
  not_found: 'The repository or account was not found, or the token has no access to it',
  rate_limited: 'The GitHub rate limit was exceeded; try again later',
  already_exists: 'It already exists on GitHub',
  repo_not_empty: 'The repository is not empty',
  conflict: 'The repository changed during the operation; try again',
  validation: 'GitHub rejected the request as invalid',
  unavailable: 'GitHub is temporarily unavailable',
  timeout: 'GitHub did not respond in time',
  network: 'Cannot reach GitHub; check the network',
  bad_response: 'GitHub returned an unexpected response',
};

export interface GitErrorDetails {
  /** HTTP status of the GitHub response, when there was one. */
  status?: number;
  /** When the rate limit resets (ISO 8601). */
  resetAt?: string;
  /** Permissions GitHub says the operation needs, e.g. `contents=write`. */
  requiredPermissions?: string[];
}

/**
 * A failed call to the Git host, reduced to a fixed, readable message and a few safe
 * details. It never carries the response body, the request or its headers: those can
 * contain the token, and the error travels up to the API client.
 */
export class GitError extends Error {
  override name = 'GitError';

  constructor(
    readonly kind: GitErrorKind,
    readonly details: GitErrorDetails = {},
  ) {
    super(MESSAGES[kind]);
  }
}

interface RequestFailure {
  status: number;
  cause?: unknown;
  response?: { headers: Record<string, string | number | undefined>; data?: unknown };
}

function isRequestFailure(error: unknown): error is RequestFailure {
  return error instanceof Error && typeof (error as { status?: unknown }).status === 'number';
}

const PERMISSION = /^[a-z_]+=(read|write|admin)$/;

function header(failure: RequestFailure, name: string): string | undefined {
  const value = failure.response?.headers[name];
  return value === undefined ? undefined : String(value);
}

function rateLimitReset(failure: RequestFailure, now: number): string | undefined {
  const reset = Number(header(failure, 'x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) return new Date(reset * 1000).toISOString();
  const retryAfter = Number(header(failure, 'retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return new Date(now + retryAfter * 1000).toISOString();
  }
  return undefined;
}

function isRateLimited(failure: RequestFailure): boolean {
  return (
    failure.status === 429 ||
    header(failure, 'x-ratelimit-remaining') === '0' ||
    header(failure, 'retry-after') !== undefined
  );
}

/** Only fixed, well-formed permission names from the header are kept. */
function requiredPermissions(failure: RequestFailure): string[] {
  return (header(failure, 'x-accepted-github-permissions') ?? '')
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => PERMISSION.test(part));
}

/** The body is read only to tell "already exists" from other 422s; it is never passed on. */
function saysAlreadyExists(data: unknown): boolean {
  const text = JSON.stringify(data ?? '').toLowerCase();
  return text.includes('already exists');
}

/**
 * Maps anything a GitHub call throws to a `GitError`. Errors that are not HTTP failures
 * (programming errors) are returned unchanged so they are not disguised as GitHub errors.
 */
export function toGitError(error: unknown, now = Date.now()): unknown {
  if (error instanceof GitError) return error;
  if (!isRequestFailure(error)) return error;
  // Our own fetch wrapper reports timeouts and network failures; Octokit wraps them.
  if (error.cause instanceof GitError) return error.cause;
  if (!error.response) return new GitError('network');

  const status = error.status;
  if (status === 401) return new GitError('unauthorized', { status });
  if ((status === 403 || status === 429) && isRateLimited(error)) {
    const resetAt = rateLimitReset(error, now);
    return new GitError('rate_limited', resetAt ? { status, resetAt } : { status });
  }
  if (status === 403) {
    const permissions = requiredPermissions(error);
    return new GitError(
      'forbidden',
      permissions.length > 0 ? { status, requiredPermissions: permissions } : { status },
    );
  }
  if (status === 404) return new GitError('not_found', { status });
  if (status === 409) return new GitError('conflict', { status });
  if (status === 422) {
    return new GitError(saysAlreadyExists(error.response.data) ? 'already_exists' : 'validation', {
      status,
    });
  }
  if (status >= 500) return new GitError('unavailable', { status });
  return new GitError('bad_response', { status });
}

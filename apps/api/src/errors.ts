import { InvalidReferenceError } from '@aievo/db';
import { GitError } from '@aievo/git';
import type { GitErrorKind } from '@aievo/git';
import { ProviderError } from '@aievo/llm';
import type { ProviderErrorKind } from '@aievo/llm';
import type { z } from 'zod';

/** Error payload shared by every API response: `{ error: { code, message, details? } }`. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export function notFound(path: string): ApiError {
  return new ApiError(404, 'not_found', `No route matches ${path}`);
}

export function resourceNotFound(
  entity: 'Project' | 'Task' | 'Provider' | 'Model' | 'Git credential',
): ApiError {
  return new ApiError(404, 'not_found', `${entity} not found`);
}

/** A route with a body schema received no body or a body that is not JSON. */
export function unsupportedMediaType(): ApiError {
  return new ApiError(415, 'unsupported_media_type', 'Request body must be JSON');
}

export interface ValidationIssue {
  path: (string | number)[];
  code: string;
  message: string;
}

/** Only the location and reason of each issue are returned, never the rejected value. */
export function validationError(issues: readonly z.core.$ZodIssue[]): ApiError {
  const details: ValidationIssue[] = issues.map((issue) => ({
    path: issue.path.map((key) => (typeof key === 'symbol' ? String(key) : key)),
    code: issue.code,
    message: issue.message,
  }));
  return new ApiError(400, 'validation_error', 'Request validation failed', details);
}

/**
 * The stored key of a provider cannot be decrypted, typically because `AIEVO_MASTER_KEY`
 * changed. Only a new key fixes it, so this is a conflict with the stored state, not a 500.
 */
export function storedKeyUnreadable(): ApiError {
  return new ApiError(
    409,
    'provider_key_unreadable',
    'The stored API key cannot be decrypted (was AIEVO_MASTER_KEY changed?). Enter the key again.',
  );
}

/** A field that the provider type requires would be missing after the write. */
export function missingFieldsError(fields: readonly string[], message: string): ApiError {
  const details: ValidationIssue[] = fields.map((field) => ({
    path: ['body', field],
    code: 'custom',
    message,
  }));
  return new ApiError(400, 'validation_error', 'Request validation failed', details);
}

/**
 * The stored Git token cannot be decrypted, typically because `AIEVO_MASTER_KEY` changed.
 * Only a new token fixes it, so this is a conflict with the stored state, not a 500.
 */
export function storedTokenUnreadable(): ApiError {
  return new ApiError(
    409,
    'git_token_unreadable',
    'The stored GitHub token cannot be decrypted (was AIEVO_MASTER_KEY changed?). Add the token again.',
  );
}

const GIT_ERRORS: Record<GitErrorKind, { status: number; code: string }> = {
  unauthorized: { status: 400, code: 'git_auth_failed' },
  forbidden: { status: 400, code: 'git_permission_denied' },
  not_found: { status: 404, code: 'git_not_found' },
  rate_limited: { status: 429, code: 'git_rate_limited' },
  already_exists: { status: 409, code: 'git_already_exists' },
  repo_not_empty: { status: 409, code: 'git_repo_not_empty' },
  conflict: { status: 409, code: 'git_conflict' },
  validation: { status: 400, code: 'git_validation_failed' },
  unavailable: { status: 502, code: 'git_unavailable' },
  network: { status: 502, code: 'git_unavailable' },
  timeout: { status: 504, code: 'git_timeout' },
  bad_response: { status: 502, code: 'git_bad_response' },
};

/** Status codes a route that calls GitHub can answer with. */
export const GIT_ERROR_STATUSES = [404, 429, 502, 504];

/**
 * `GitError` messages are fixed texts written in `@aievo/git` and its details hold only
 * the GitHub status, a reset time and permission names, so both are safe to return.
 */
function fromGitError(error: GitError): ApiError {
  const { status, code } = GIT_ERRORS[error.kind];
  const { status: githubStatus, ...rest } = error.details;
  const details = {
    ...(githubStatus === undefined ? {} : { githubStatus }),
    ...rest,
  };
  return new ApiError(
    status,
    code,
    error.message,
    Object.keys(details).length > 0 ? details : undefined,
  );
}

const PROVIDER_ERRORS: Record<ProviderErrorKind, { status: number; code: string }> = {
  unauthorized: { status: 400, code: 'provider_auth_failed' },
  forbidden: { status: 400, code: 'provider_auth_failed' },
  rate_limited: { status: 429, code: 'provider_rate_limited' },
  timeout: { status: 504, code: 'provider_timeout' },
  network: { status: 502, code: 'provider_unavailable' },
  unavailable: { status: 502, code: 'provider_unavailable' },
  not_found: { status: 502, code: 'provider_bad_response' },
  bad_response: { status: 502, code: 'provider_bad_response' },
};

/** Status codes a route that calls a model provider can answer with. */
export const PROVIDER_ERROR_STATUSES = [429, 502, 504];

/**
 * `ProviderError` messages are fixed texts written in `@aievo/llm`, so they are safe to
 * return. Only the provider's HTTP status is added; its body and headers never are.
 */
function fromProviderError(error: ProviderError): ApiError {
  const { status, code } = PROVIDER_ERRORS[error.kind];
  const details = error.status === undefined ? undefined : { providerStatus: error.status };
  return new ApiError(status, code, error.message, details);
}

/**
 * Client errors that Express middleware throws before a route is reached,
 * mostly from `express.json()`. Their own messages can quote the request body,
 * so the client gets a fixed message instead and the original goes to the logs.
 */
const BAD_REQUEST = { code: 'bad_request', message: 'Malformed request' };

const CLIENT_ERRORS: Record<number, { code: string; message: string }> = {
  400: BAD_REQUEST,
  413: { code: 'payload_too_large', message: 'Request body is too large' },
  415: { code: 'unsupported_media_type', message: 'Unsupported request encoding' },
};

function readStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const value = typeof status === 'number' ? status : statusCode;

  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599
    ? value
    : undefined;
}

/** Maps anything thrown inside a request to the error contract of the API. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ProviderError) {
    return fromProviderError(error);
  }

  if (error instanceof GitError) {
    return fromGitError(error);
  }

  if (error instanceof InvalidReferenceError) {
    // The message is written by our own repository code and never quotes user input.
    return new ApiError(400, 'invalid_reference', error.message);
  }

  const status = readStatus(error);

  if (status !== undefined && status < 500) {
    const { code, message } = CLIENT_ERRORS[status] ?? BAD_REQUEST;
    return new ApiError(status, code, message);
  }

  return new ApiError(500, 'internal_error', 'Unexpected server error');
}

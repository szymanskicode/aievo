import { InvalidReferenceError } from '@aievo/db';
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

export function resourceNotFound(entity: 'Project' | 'Task'): ApiError {
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

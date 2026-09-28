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

  const status = readStatus(error);

  if (status !== undefined && status < 500) {
    const { code, message } = CLIENT_ERRORS[status] ?? BAD_REQUEST;
    return new ApiError(status, code, message);
  }

  return new ApiError(500, 'internal_error', 'Unexpected server error');
}

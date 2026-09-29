import { ApiClientError } from '@aievo/api-client';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { errorMessage } from './errors';

interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    Array.isArray(value.path) &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

/**
 * Shows an API error in a form: validation issues of the request body go to their fields,
 * everything else becomes the form-level (`root`) error.
 */
export function applyApiErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): void {
  let applied = false;

  if (
    error instanceof ApiClientError &&
    error.code === 'validation_error' &&
    Array.isArray(error.details)
  ) {
    for (const issue of error.details.filter(isValidationIssue)) {
      const [location, field] = issue.path;
      const name = fields.find((candidate) => candidate === field);
      if (location === 'body' && name) {
        setError(name, { type: 'server', message: issue.message });
        applied = true;
      }
    }
  }

  if (!applied) setError('root', { type: 'server', message: errorMessage(error) });
}

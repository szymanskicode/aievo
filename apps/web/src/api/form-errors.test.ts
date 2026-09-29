import { ApiClientError } from '@aievo/api-client';
import { describe, expect, it, vi } from 'vitest';

import { applyApiErrors } from './form-errors';

interface Values {
  name: string;
  repoUrl: string;
}

const FIELDS = ['name', 'repoUrl'] as const;

describe('applyApiErrors', () => {
  it('puts body validation issues on their fields', () => {
    const setError = vi.fn();
    const error = new ApiClientError(400, 'validation_error', 'Request validation failed', [
      { path: ['body', 'repoUrl'], code: 'invalid_format', message: 'Invalid URL' },
    ]);

    applyApiErrors<Values>(error, setError, FIELDS);

    expect(setError).toHaveBeenCalledExactlyOnceWith('repoUrl', {
      type: 'server',
      message: 'Invalid URL',
    });
  });

  it('uses the form-level error when no issue matches a field', () => {
    const setError = vi.fn();
    const error = new ApiClientError(400, 'validation_error', 'Request validation failed', [
      { path: ['params', 'id'], code: 'invalid_format', message: 'Invalid UUID' },
    ]);

    applyApiErrors<Values>(error, setError, FIELDS);

    expect(setError).toHaveBeenCalledExactlyOnceWith('root', {
      type: 'server',
      message: 'Request validation failed',
    });
  });

  it('uses the form-level error for other API errors', () => {
    const setError = vi.fn();

    applyApiErrors<Values>(
      new ApiClientError(404, 'not_found', 'Project not found'),
      setError,
      FIELDS,
    );

    expect(setError).toHaveBeenCalledExactlyOnceWith('root', {
      type: 'server',
      message: 'Project not found',
    });
  });
});

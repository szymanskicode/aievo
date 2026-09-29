import { ApiClientError } from '@aievo/api-client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('shows the message from the API error format', () => {
    render(<ErrorState error={new ApiClientError(404, 'not_found', 'Project not found')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Project not found');
  });

  it('hides internal messages of other errors', () => {
    render(<ErrorState error={new TypeError('x is undefined')} />);

    expect(screen.getByRole('alert')).not.toHaveTextContent('x is undefined');
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('calls onRetry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new Error('x')} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});

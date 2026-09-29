import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { LabelsInput } from './LabelsInput';

function Harness({ initial = [] }: { initial?: string[] }) {
  const [labels, setLabels] = useState(initial);
  return (
    <>
      <LabelsInput id="labels" aria-invalid={false} value={labels} onChange={setLabels} />
      <output aria-label="value">{JSON.stringify(labels)}</output>
    </>
  );
}

function value(): unknown {
  return JSON.parse(screen.getByRole('status', { name: 'value' }).textContent ?? '[]');
}

describe('LabelsInput', () => {
  it('adds a label on Enter or comma, trimmed, and ignores duplicates and blanks', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('textbox'), '  ui {Enter}api,ui{Enter}   {Enter}');

    expect(value()).toEqual(['ui', 'api']);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('removes the last label with Backspace on an empty input only', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['ui', 'api']} />);

    await user.type(screen.getByRole('textbox'), 'x{Backspace}');
    expect(value()).toEqual(['ui', 'api']);

    await user.keyboard('{Backspace}');
    expect(value()).toEqual(['ui']);
  });

  it('keeps a typed label when the input loses focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('textbox'), 'backend');
    await user.tab();

    expect(value()).toEqual(['backend']);
  });

  it('removes a label with its button', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['ui', 'api']} />);

    await user.click(screen.getByRole('button', { name: 'Remove label ui' }));

    expect(value()).toEqual(['api']);
  });
});

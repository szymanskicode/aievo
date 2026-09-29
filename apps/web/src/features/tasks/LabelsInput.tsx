import { XIcon } from 'lucide-react';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { ControlProps } from '@/components/form/FormField';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface LabelsInputProps extends ControlProps {
  value: string[];
  onChange: (labels: string[]) => void;
  onBlur?: () => void;
}

/** Labels as chips: Enter or a comma adds the typed label, Backspace on empty removes the last. */
export function LabelsInput({ value, onChange, onBlur, ...control }: LabelsInputProps) {
  const [draft, setDraft] = useState('');

  function commit() {
    const label = draft.trim();
    setDraft('');
    if (label && !value.includes(label)) onChange([...value, label]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul aria-label="Added labels" className="flex flex-wrap gap-1">
          {value.map((label) => (
            <li key={label}>
              <Badge variant="secondary" className="gap-1 pr-1">
                {label}
                <button
                  type="button"
                  aria-label={`Remove label ${label}`}
                  className="rounded-full hover:bg-muted-foreground/20"
                  onClick={() => onChange(value.filter((candidate) => candidate !== label))}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        {...control}
        value={draft}
        placeholder="Type a label and press Enter"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          commit();
          onBlur?.();
        }}
      />
    </div>
  );
}

import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';

/** Props a control needs so its label, hint and error are announced together. */
export interface ControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}

interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  children: (control: ControlProps) => ReactNode;
}

export function FormField({ id, label, hint, error, children }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Error of the whole form, e.g. an API error that belongs to no field. */
export function FormError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

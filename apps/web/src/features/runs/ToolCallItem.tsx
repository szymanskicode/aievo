import type { Schemas } from '@aievo/api-client';
import { ChevronRightIcon, CircleAlertIcon } from 'lucide-react';
import { useId, useState } from 'react';

import { formatArgs, formatDuration } from './format';

/** One tool call: name, short arguments and time; the result opens on demand. */
export function ToolCallItem({ call }: { call: Schemas['ToolCall'] }) {
  const [open, setOpen] = useState(false);
  const resultId = useId();

  return (
    <li
      aria-label={`${call.tool}${call.isError ? ' (error)' : ''}`}
      className={`rounded-md border text-sm ${call.isError ? 'border-destructive/50 bg-destructive/5' : ''}`}
    >
      <button
        type="button"
        aria-expanded={open}
        // The result is only rendered while open, so it is only referenced then.
        aria-controls={open ? resultId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRightIcon
          className={`size-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
        {call.isError && (
          <CircleAlertIcon className="size-4 shrink-0 text-destructive" aria-hidden />
        )}
        <span className={`font-mono font-medium ${call.isError ? 'text-destructive' : ''}`}>
          {call.tool}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {formatArgs(call.args)}
        </span>
        {call.exitCode !== null && (
          <span className="shrink-0 text-xs text-muted-foreground">exit {call.exitCode}</span>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDuration(call.durationMs)}
        </span>
        <span className="sr-only">{open ? 'Hide result' : 'Show result'}</span>
      </button>
      {open && (
        <pre
          id={resultId}
          aria-label={`Result of ${call.tool}`}
          className="max-h-96 overflow-auto border-t bg-muted/50 px-3 py-2 font-mono text-xs whitespace-pre-wrap"
        >
          {call.result === '' ? '(no output)' : call.result}
        </pre>
      )}
    </li>
  );
}

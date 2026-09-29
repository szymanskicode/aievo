import type { Schemas } from '@aievo/api-client';
import type { StepStatus } from '@aievo/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  CheckIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
  XIcon,
} from 'lucide-react';
import { useState } from 'react';

import { ErrorState } from '@/components/states/ErrorState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { elapsedMs, formatCost, formatDuration } from './format';
import { moreToolCallsQuery } from './queries';
import { ToolCallItem } from './ToolCallItem';

type Step = Schemas['Step'];

const stepTitles: Record<string, string> = {
  implement: 'Programista implements the task',
  check: 'Platform runs the tests',
};

const stepStatusLabels: Record<StepStatus, string> = {
  queued: 'Waiting',
  running: 'Running',
  succeeded: 'Done',
  failed: 'Failed',
  cancelled: 'Stopped',
};

function StepIcon({ status }: { status: StepStatus }) {
  const className = 'size-4';
  switch (status) {
    case 'running':
      return <LoaderCircleIcon className={`${className} animate-spin`} aria-hidden />;
    case 'succeeded':
      return <CheckIcon className={className} aria-hidden />;
    case 'failed':
      return <CircleAlertIcon className={`${className} text-destructive`} aria-hidden />;
    case 'cancelled':
      return <XIcon className={className} aria-hidden />;
    case 'queued':
      return <CircleDashedIcon className={className} aria-hidden />;
  }
}

/** Tool calls past the first page of a step, loaded when asked for. */
function MoreToolCalls({ step, after }: { step: Step; after: string }) {
  const more = useInfiniteQuery(moreToolCallsQuery(step.id, after));
  const loaded = more.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      {loaded.map((call) => (
        <ToolCallItem key={call.id} call={call} />
      ))}
      {more.isError && (
        <li>
          <ErrorState
            error={more.error}
            title="Could not load more tool calls"
            onRetry={() => void more.refetch()}
          />
        </li>
      )}
      {more.hasNextPage && (
        <li>
          <Button
            variant="outline"
            size="sm"
            disabled={more.isFetchingNextPage}
            onClick={() => void more.fetchNextPage()}
          >
            Show more tool calls
          </Button>
        </li>
      )}
    </>
  );
}

function ToolCalls({ step }: { step: Step }) {
  const [showMore, setShowMore] = useState(false);
  const { items, nextCursor } = step.toolCalls;
  if (step.toolCallCount === 0) return null;

  return (
    <ol aria-label="Tool calls" className="flex flex-col gap-1">
      {items.map((call) => (
        <ToolCallItem key={call.id} call={call} />
      ))}
      {nextCursor &&
        (showMore ? (
          <MoreToolCalls step={step} after={nextCursor} />
        ) : (
          <li>
            <Button variant="outline" size="sm" onClick={() => setShowMore(true)}>
              Show {step.toolCallCount - items.length} more tool calls
            </Button>
          </li>
        ))}
    </ol>
  );
}

/** What the agent reported with `finish`: the summary a reviewer reads first. */
export function AgentSummary({ result }: { result: NonNullable<Step['result']> }) {
  return (
    <section
      aria-labelledby="agent-summary"
      className="flex flex-col gap-3 rounded-md border p-4 text-sm"
    >
      <h2 id="agent-summary" className="text-base font-semibold">
        Agent summary
      </h2>
      <p className="whitespace-pre-wrap">{result.summary}</p>
      {result.changedFiles.length > 0 && (
        <div>
          <h4 className="font-medium">Changed files</h4>
          <ul className="font-mono text-xs">
            {result.changedFiles.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="font-medium">Tests</h4>
        <p>
          <Badge variant={result.tests.passed ? 'default' : 'destructive'}>
            {result.tests.passed ? 'Passed' : 'Not passing'}
          </Badge>{' '}
          {result.tests.summary}
        </p>
      </div>
      {result.openIssues.length > 0 && (
        <div>
          <h4 className="font-medium">Open issues</h4>
          <ul className="list-disc pl-5">
            {result.openIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function StepItem({ step }: { step: Step }) {
  const title = stepTitles[step.stepKey] ?? step.stepKey;
  const duration = elapsedMs(step.startedAt, step.endedAt);

  return (
    <li aria-label={title} className="flex flex-col gap-3 border-l-2 pb-6 pl-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StepIcon status={step.status} />
        <h3 className="font-medium">{title}</h3>
        <span className="text-sm text-muted-foreground">{stepStatusLabels[step.status]}</span>
        <span className="text-sm text-muted-foreground">
          {[
            duration !== null ? formatDuration(duration) : null,
            step.costUsd > 0 ? formatCost(step.costUsd) : null,
            step.iterations !== null ? `${step.iterations} model calls` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      {step.error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>The step failed ({step.error.code})</AlertTitle>
          <AlertDescription>{step.error.message}</AlertDescription>
        </Alert>
      )}
      <ToolCalls step={step} />
    </li>
  );
}

export function StepTimeline({ steps }: { steps: Step[] }) {
  return (
    <ol aria-label="Steps" className="flex flex-col">
      {steps.map((step) => (
        <StepItem key={step.id} step={step} />
      ))}
    </ol>
  );
}

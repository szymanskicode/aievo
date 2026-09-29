import type { Schemas } from '@aievo/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, getRouteApi } from '@tanstack/react-router';
import { ChevronLeftIcon, CircleAlertIcon, ExternalLinkIcon, SquareIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { errorMessage } from '@/api/errors';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { taskKeys, taskQuery } from '@/features/tasks/queries';

import { elapsedMs, formatCost, formatDuration, formatTokens } from './format';
import { runKeys, runQuery, runStepsQuery, useCancelRun } from './queries';
import { isOpenRun } from './run-status';
import { RunStatusBadge } from './RunStatusBadge';
import { AgentSummary, StepTimeline } from './StepTimeline';

type Run = Schemas['Run'];

const route = getRouteApi('/runs/$runId');

function CancelRunButton({ run }: { run: Run }) {
  const cancelRun = useCancelRun(run);

  if (run.cancelRequestedAt) {
    return <span className="text-sm text-muted-foreground">Stopping…</span>;
  }

  function onConfirm() {
    cancelRun.mutate(undefined, {
      onSuccess: () => toast.success('The agent is being stopped'),
      onError: (error) => toast.error(`Could not stop the agent: ${errorMessage(error)}`),
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={cancelRun.isPending}>
          <SquareIcon />
          Cancel run
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this run?</AlertDialogTitle>
          <AlertDialogDescription>
            The agent stops within a few seconds. Nothing is pushed and no pull request is opened.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep running</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Cancel run
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function RunHeader({ run }: { run: Run }) {
  const task = useQuery(taskQuery(run.taskId));
  const duration = elapsedMs(run.startedAt, run.endedAt);

  return (
    <header className="flex flex-col gap-4">
      {task.data && (
        <Link
          to="/projects/$projectId"
          params={{ projectId: task.data.projectId }}
          search={{ task: task.data.id }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          Back to the task
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {task.data ? `Run of “${task.data.title}”` : 'Run'}
          </h1>
          <RunStatusBadge status={run.status} />
        </div>
        {isOpenRun(run.status) && <CancelRunButton run={run} />}
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Fact label="Branch">
          <span className="font-mono text-xs break-all">{run.branch ?? '—'}</span>
        </Fact>
        <Fact label="Pull request">
          {run.prUrl ? (
            <a
              href={run.prUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:underline"
            >
              #{run.prNumber}
              <ExternalLinkIcon className="size-3" aria-hidden />
            </a>
          ) : (
            '—'
          )}
        </Fact>
        <Fact label="Cost">{formatCost(run.costUsd)}</Fact>
        <Fact label="Tokens">
          {formatTokens(run.tokensIn)} in / {formatTokens(run.tokensOut)} out
        </Fact>
        <Fact label="Time">{duration === null ? '—' : formatDuration(duration)}</Fact>
      </dl>
    </header>
  );
}

function RunSteps({ run }: { run: Run }) {
  const open = isOpenRun(run.status);
  const steps = useQuery(runStepsQuery(run.id, open));
  const queryClient = useQueryClient();

  // Polling stops with the run; the steps are read once more to catch what the last poll
  // missed, and the task (its status, its card on the board) moved on with the run.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      void queryClient.invalidateQueries({ queryKey: runKeys.steps(run.id) });
      // Also the runs of the task, which live under the task's key.
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(run.taskId) });
      const task = queryClient.getQueryData<Schemas['Task']>(taskKeys.detail(run.taskId));
      if (task) void queryClient.invalidateQueries({ queryKey: taskKeys.list(task.projectId) });
    }
    wasOpen.current = open;
  }, [open, queryClient, run.id, run.taskId]);

  if (steps.isPending) return <LoadingState label="Loading steps" />;
  if (steps.isError) {
    return (
      <ErrorState
        error={steps.error}
        title="Could not load the steps"
        onRetry={() => void steps.refetch()}
      />
    );
  }

  const result = steps.data.findLast((step) => step.result)?.result;
  return (
    <>
      {steps.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {run.status === 'queued' ? 'Waiting for a worker…' : 'No steps yet.'}
        </p>
      ) : (
        <StepTimeline steps={steps.data} />
      )}
      {result && <AgentSummary result={result} />}
    </>
  );
}

export function RunPage() {
  const { runId } = route.useParams();
  const run = useQuery(runQuery(runId));

  if (run.isPending) return <LoadingState label="Loading run" />;
  if (run.isError) {
    return (
      <ErrorState
        error={run.error}
        title="Could not load the run"
        onRetry={() => void run.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <RunHeader run={run.data} />
      {run.data.error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>The run failed</AlertTitle>
          <AlertDescription>
            <p className="whitespace-pre-wrap">{run.data.error.message}</p>
            <p className="font-mono text-xs">{run.data.error.code}</p>
          </AlertDescription>
        </Alert>
      )}
      <RunSteps run={run.data} />
    </div>
  );
}

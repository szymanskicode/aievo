import type { Schemas } from '@aievo/api-client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { BotIcon, ExternalLinkIcon } from 'lucide-react';
import { toast } from 'sonner';

import { errorMessage } from '@/api/errors';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { Button } from '@/components/ui/button';
import { workspaceSettingsQuery } from '@/features/agent-models/queries';
import { projectQuery } from '@/features/projects/queries';
import { setupStatusQuery } from '@/features/setup/queries';

import { elapsedMs, formatCost, formatDateTime, formatDuration } from './format';
import { taskRunsQuery, useStartRun } from './queries';
import { runBlockers } from './run-blockers';
import { RunStatusBadge } from './RunStatusBadge';

type Task = Schemas['Task'];
type Run = Schemas['Run'];

function StartRunButton({ task, runs }: { task: Task; runs: Run[] }) {
  const setup = useQuery(setupStatusQuery());
  const settings = useQuery(workspaceSettingsQuery());
  const project = useQuery(projectQuery(task.projectId));
  const startRun = useStartRun(task);
  const navigate = useNavigate();

  if (setup.isPending || settings.isPending || project.isPending) {
    return <LoadingState label="Checking what the agent needs" />;
  }
  const failed = setup.error ?? settings.error ?? project.error;
  if (failed || !setup.data || !settings.data || !project.data) {
    return (
      <ErrorState
        error={failed}
        title="Could not check what the agent needs"
        onRetry={() => {
          for (const query of [setup, settings, project]) {
            if (query.isError) void query.refetch();
          }
        }}
      />
    );
  }

  const blockers = runBlockers({
    setup: setup.data,
    settings: settings.data,
    project: project.data,
    runs,
  });

  function start() {
    startRun.mutate(undefined, {
      onSuccess: (run) => {
        toast.success('The agent was started');
        void navigate({ to: '/runs/$runId', params: { runId: run.id } });
      },
      onError: (error) => toast.error(`Could not start the agent: ${errorMessage(error)}`),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={blockers.length > 0 || startRun.isPending}
        aria-describedby={blockers.length > 0 ? 'run-blockers' : undefined}
        onClick={start}
      >
        <BotIcon />
        {startRun.isPending ? 'Starting…' : 'Run agent'}
      </Button>
      {blockers.length > 0 && (
        <ul id="run-blockers" className="flex flex-col gap-1 text-sm text-muted-foreground">
          {blockers.map((blocker) => (
            <li key={blocker.message}>
              {blocker.message}{' '}
              {blocker.link && (
                <Link to={blocker.link.to} className="text-foreground underline">
                  {blocker.link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RunRow({ run }: { run: Run }) {
  const duration = elapsedMs(run.startedAt, run.endedAt);
  return (
    <li className="flex flex-col gap-1 rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/runs/$runId"
          params={{ runId: run.id }}
          className="font-medium hover:underline"
          aria-label={`Run from ${formatDateTime(run.createdAt)}`}
        >
          {formatDateTime(run.createdAt)}
        </Link>
        <RunStatusBadge status={run.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
        {duration !== null && <span>{formatDuration(duration)}</span>}
        <span>{formatCost(run.costUsd)}</span>
        {run.prUrl && (
          <a
            href={run.prUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-foreground hover:underline"
          >
            Pull request #{run.prNumber}
            <ExternalLinkIcon className="size-3" aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}

/** The agent runs of a task and the button that starts a new one. */
export function TaskRuns({ task }: { task: Task }) {
  const runs = useQuery(taskRunsQuery(task.id));

  return (
    <section aria-labelledby="task-runs" className="flex flex-col gap-3">
      <h3 id="task-runs" className="font-medium">
        Agent runs
      </h3>
      {runs.isPending ? (
        <LoadingState label="Loading runs" />
      ) : runs.isError ? (
        <ErrorState
          error={runs.error}
          title="Could not load runs"
          onRetry={() => void runs.refetch()}
        />
      ) : (
        <>
          <StartRunButton task={task} runs={runs.data} />
          {runs.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">The agent has not worked on it yet.</p>
          ) : (
            <ul aria-label="Runs" className="flex flex-col gap-2">
              {runs.data.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

import { rm } from 'node:fs/promises';
import path from 'node:path';

import {
  claimRun,
  createToolCall,
  finishRun,
  finishStep,
  isRunCancelRequested,
  startStep,
  updateRun,
} from '@aievo/db';
import type { ClaimedRun, Db, Step } from '@aievo/db';
import { agentBranchName, redactToken } from '@aievo/git';
import type { LocalGit } from '@aievo/git';
import type { RunJobOutcome } from '@aievo/queue';
import type { ExecResult, Sandbox, SandboxFactory, SandboxLimits } from '@aievo/sandbox';
import { truncateToolResult } from '@aievo/shared';
import type { Logger } from 'pino';

import type { OpenGitToken } from './git-token.js';
import { RunFailure } from './run-failure.js';

export interface RunnerConfig {
  /** Runs work in `<workDir>/runs/<run id>`. */
  workDir: string;
  maxRunMs: number;
  maxRunsPerProject: number;
  commandTimeoutMs: number;
  limits: SandboxLimits;
  /** How long a run waits in the queue when its project is busy. */
  busyRetrySeconds: number;
  /** How often a running run checks whether it was cancelled. */
  cancelPollMs: number;
  /** Base of clone URLs, e.g. `https://github.com`. */
  gitHostUrl: string;
}

export interface RunnerDeps {
  db: Db;
  git: LocalGit;
  sandboxes: SandboxFactory;
  openGitToken: OpenGitToken;
  logger: Logger;
  config: RunnerConfig;
}

/** Identifies the diagnostic step until agents (and their preset hashes) exist. */
export const DIAGNOSTIC_AGENT = { agentKey: 'diagnostic', agentVersion: 'diagnostic-v1' } as const;

/** Lines of command output kept in a run error message. */
const ERROR_OUTPUT_LINES = 20;

type StopReason = 'cancelled' | 'timeout' | 'shutdown';

/** The working directory of a run on the host. */
export function runDir(workDir: string, runId: string): string {
  return path.join(workDir, 'runs', runId);
}

/**
 * Executes one diagnostic run: clone and branch on the host, then install dependencies and run
 * the project's tests in a sandbox, recording the test command as the `check` step. Every
 * outcome ends in the run's status; only a failure to reach the database escapes.
 */
export async function executeRun(
  runId: string,
  deps: RunnerDeps,
  shutdown: AbortSignal,
): Promise<RunJobOutcome> {
  const claim = await claimRun(deps.db, runId, deps.config.maxRunsPerProject);
  if (claim.kind === 'busy') return { retryAfterSeconds: deps.config.busyRetrySeconds };
  if (claim.kind === 'skip') return undefined;

  const log = deps.logger.child({ runId, taskId: claim.task.id });
  log.info('Run started');
  const stop = watchStopReasons(deps, claim, shutdown);
  const dir = runDir(deps.config.workDir, runId);
  const state: RunState = { token: undefined, sandbox: undefined, step: undefined };

  try {
    await prepare(deps, claim, dir, stop.signal, state);
    await check(deps, claim, stop.signal, state);
  } catch (error) {
    await failRun(deps, claim, error, stop.reason(), state, log);
  } finally {
    stop.dispose();
    await cleanUp(state, dir, log);
  }
  return undefined;
}

interface RunState {
  token: string | undefined;
  sandbox: Sandbox | undefined;
  step: Step | undefined;
}

async function prepare(
  deps: RunnerDeps,
  { workspaceId, run, task, project }: ClaimedRun,
  dir: string,
  signal: AbortSignal,
  state: RunState,
): Promise<void> {
  const { repoOwner, repoName, gitCredentialId } = project;
  if (!repoOwner || !repoName || !gitCredentialId) {
    throw new RunFailure('project_not_linked', 'The project has no GitHub repository or token');
  }
  if (!project.settings.commands.test) {
    throw new RunFailure('test_command_missing', 'The project has no test command');
  }

  state.token = await deps.openGitToken(workspaceId, gitCredentialId);
  signal.throwIfAborted();

  const repoDir = path.join(dir, 'repo');
  const url = `${deps.config.gitHostUrl}/${repoOwner}/${repoName}.git`;
  const branch = agentBranchName(task.id, task.title);
  try {
    await deps.git.clone({
      url,
      dir: repoDir,
      branch: project.defaultBranch,
      token: state.token,
      signal,
    });
    await deps.git.createBranch(repoDir, branch, signal);
  } catch (error) {
    signal.throwIfAborted();
    throw new RunFailure(
      'clone_failed',
      `Cloning ${repoOwner}/${repoName} (branch ${project.defaultBranch}) failed: ${describe(error)}`,
      { cause: error },
    );
  }
  await updateRun(deps.db, workspaceId, run.id, { branch });

  try {
    state.sandbox = await deps.sandboxes.create({
      runId: run.id,
      workspaceDir: repoDir,
      limits: deps.config.limits,
    });
  } catch (error) {
    signal.throwIfAborted();
    throw new RunFailure('sandbox_failed', `The sandbox could not start: ${describe(error)}`, {
      cause: error,
    });
  }

  const install = project.settings.commands.install;
  if (install) {
    const result = await state.sandbox.exec(install, {
      timeoutMs: deps.config.commandTimeoutMs,
      signal,
    });
    signal.throwIfAborted();
    if (result.exitCode !== 0) {
      throw new RunFailure('install_failed', commandFailure('Install command', install, result));
    }
  }
}

async function check(
  deps: RunnerDeps,
  { workspaceId, run, project }: ClaimedRun,
  signal: AbortSignal,
  state: RunState,
): Promise<void> {
  const sandbox = state.sandbox;
  const command = project.settings.commands.test;
  if (!sandbox || !command) throw new Error('check() needs a prepared run');

  await updateRun(deps.db, workspaceId, run.id, { status: 'running' });
  const step = await startStep(deps.db, workspaceId, run.id, {
    stepKey: 'check',
    ...DIAGNOSTIC_AGENT,
    input: { command },
  });
  if (!step) throw new Error('The run is no longer open');
  state.step = step;

  const result = await sandbox.exec(command, { timeoutMs: deps.config.commandTimeoutMs, signal });
  signal.throwIfAborted();
  const passed = result.exitCode === 0;

  await createToolCall(deps.db, workspaceId, step.id, {
    tool: 'run_command',
    args: { command },
    result: truncateToolResult(redactToken(result.output, state.token)),
    isError: !passed,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
  });
  await finishStep(deps.db, workspaceId, step.id, {
    status: passed ? 'succeeded' : 'failed',
    output: { exitCode: result.exitCode, timedOut: result.timedOut, truncated: result.truncated },
  });

  if (!passed) {
    throw new RunFailure(
      result.timedOut ? 'tests_timed_out' : 'tests_failed',
      commandFailure('Test command', command, result),
    );
  }
  await finishRun(deps.db, workspaceId, run.id, { status: 'succeeded' });
}

async function failRun(
  deps: RunnerDeps,
  { workspaceId, run }: ClaimedRun,
  error: unknown,
  reason: StopReason | undefined,
  state: RunState,
  log: Logger,
): Promise<void> {
  const final = reason === 'cancelled' ? 'cancelled' : 'failed';
  let failure: RunFailure;
  if (reason === 'timeout') {
    failure = new RunFailure('run_timeout', 'The run exceeded its time limit');
  } else if (reason === 'shutdown') {
    failure = new RunFailure('worker_shutdown', 'The worker stopped while the run was in progress');
  } else if (error instanceof RunFailure) {
    failure = error;
  } else {
    log.error({ err: error }, 'Run failed unexpectedly');
    failure = new RunFailure('internal_error', 'The run failed with an unexpected error');
  }

  if (state.step) {
    await finishStep(deps.db, workspaceId, state.step.id, { status: final });
  }
  await finishRun(deps.db, workspaceId, run.id, {
    status: final,
    error:
      final === 'cancelled'
        ? null
        : { code: failure.code, message: redactToken(failure.message, state.token) },
  });
  log.info({ status: final, code: final === 'cancelled' ? undefined : failure.code }, 'Run ended');
}

async function cleanUp(state: RunState, dir: string, log: Logger): Promise<void> {
  try {
    await state.sandbox?.stop();
  } catch (error) {
    log.error({ err: error }, 'Stopping the sandbox failed');
  }
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 5 });
  } catch (error) {
    log.error({ err: error }, 'Removing the run directory failed');
  }
  state.token = undefined;
}

/**
 * One signal for everything that stops a run early (cancel request, time limit, worker
 * shutdown), plus which of them fired first.
 */
function watchStopReasons(deps: RunnerDeps, claim: ClaimedRun, shutdown: AbortSignal) {
  const controller = new AbortController();
  let reason: StopReason | undefined;
  const stopWith = (why: StopReason) => {
    if (reason) return;
    reason = why;
    controller.abort(new Error(`Run stopped: ${why}`));
  };

  const onShutdown = () => stopWith('shutdown');
  if (shutdown.aborted) onShutdown();
  else shutdown.addEventListener('abort', onShutdown, { once: true });

  const timer = setTimeout(() => stopWith('timeout'), deps.config.maxRunMs);
  let polling = false;
  const poll = setInterval(() => {
    if (polling) return;
    polling = true;
    isRunCancelRequested(deps.db, claim.workspaceId, claim.run.id)
      .then((requested) => {
        if (requested) stopWith('cancelled');
      })
      .catch((error: unknown) => deps.logger.warn({ err: error }, 'Checking for cancel failed'))
      .finally(() => {
        polling = false;
      });
  }, deps.config.cancelPollMs);

  return {
    signal: controller.signal,
    reason: () => reason,
    dispose() {
      clearTimeout(timer);
      clearInterval(poll);
      shutdown.removeEventListener('abort', onShutdown);
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function commandFailure(what: string, command: string, result: ExecResult): string {
  const status = result.timedOut ? 'timed out' : `exited with code ${String(result.exitCode)}`;
  const tail = result.output.split('\n').slice(-ERROR_OUTPUT_LINES).join('\n');
  return `${what} \`${command}\` ${status}${tail ? `:\n${tail}` : ''}`;
}

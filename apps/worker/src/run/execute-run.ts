import { rm } from 'node:fs/promises';
import path from 'node:path';

import { createNativeRuntime, matchesPath } from '@aievo/agent-runtime';
import type { AgentEvent, AgentRunInput, AllowedCommand } from '@aievo/agent-runtime';
import {
  addStepUsage,
  claimRun,
  createToolCall,
  finishRun,
  finishStep,
  getRun,
  isRunCancelRequested,
  setRunPullRequest,
  startStep,
  updateRun,
} from '@aievo/db';
import type { ClaimedRun, Db, Step } from '@aievo/db';
import { agentBranchName, redactToken } from '@aievo/git';
import type { GitProvider, LocalGit } from '@aievo/git';
import type { LoadedAgentPreset } from '@aievo/presets';
import type { RunJobOutcome } from '@aievo/queue';
import type { ExecResult, Sandbox, SandboxFactory, SandboxLimits } from '@aievo/sandbox';
import { PLATFORM_RUN_LIMITS, agentResultSchemas, truncateToolResult } from '@aievo/shared';
import type { CoderResult, JsonValue, ProjectCommands } from '@aievo/shared';
import type { Logger } from 'pino';

import type { AgentModel, OpenAgentModel } from './agent-model.js';
import type { OpenGitToken } from './git-token.js';
import { parseAcceptanceCriteria, pullRequestBody, pullRequestTitle } from './pr-body.js';
import type { CheckReport } from './pr-body.js';
import { RunFailure } from './run-failure.js';
import type { RunFailureCode } from './run-failure.js';

export interface RunnerConfig {
  /** Runs work in `<workDir>/runs/<run id>`. */
  workDir: string;
  /** Platform default of the run time limit; a project may set its own. */
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
  /** Address of the AIEvo web app, for the link to the run in the pull request. */
  webUrl: string;
  /** E-mail of the agent commits; the name comes from the agent (`AIEvo Programista`). */
  gitAuthorEmail: string;
}

export interface RunnerDeps {
  db: Db;
  git: LocalGit;
  sandboxes: SandboxFactory;
  openGitToken: OpenGitToken;
  openAgentModel: OpenAgentModel;
  /** The Git host API with the project's token, for the pull request. */
  gitProvider: (token: string) => GitProvider;
  loadAgentPreset: (key: string) => Promise<LoadedAgentPreset>;
  logger: Logger;
  config: RunnerConfig;
}

/** The agent of the `implement` step until pipelines choose agents (stage 3). */
export const CODER_AGENT_KEY = 'coder';

/** The `check` step: the platform runs the project's tests itself after the agent. */
export const PLATFORM_CHECK = { agentKey: 'platform', agentVersion: 'platform-v1' } as const;

/**
 * Test files beyond the project's `testPolicy.testPaths`: the defaults there miss common
 * layouts (e.g. `App.test.tsx`), and an existing test must never slip through as writable.
 */
export const EXTRA_TEST_GLOBS = ['**/*.test.*', '**/*.spec.*', '**/__tests__/**'];

/** Lines of command output kept in a run error message. */
const ERROR_OUTPUT_LINES = 20;

type StopReason = 'cancelled' | 'timeout' | 'shutdown';

/** The working directory of a run on the host. */
export function runDir(workDir: string, runId: string): string {
  return path.join(workDir, 'runs', runId);
}

/**
 * Executes one run: the Programista implements the task in a sandbox, the platform runs the
 * tests, then commits on the host, pushes the agent branch and opens a pull request. Every
 * outcome ends in the run's status (and the task's); only a failure to reach the database
 * escapes.
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
  const maxRunMs = runLimitMs(deps, claim);
  const stop = watchStopReasons(deps, claim, maxRunMs, shutdown);
  const dir = runDir(deps.config.workDir, runId);
  const state: RunState = {
    token: undefined,
    sandbox: undefined,
    step: undefined,
    repoDir: path.join(dir, 'repo'),
    branch: undefined,
    deadline: Date.now() + maxRunMs,
  };

  try {
    const agent = await loadAgent(deps, claim);
    await prepare(deps, claim, stop.signal, state, log);
    const implemented = await implement(deps, claim, agent, stop.signal, state, log);
    const restoredTests = await restoreExistingTests(deps, claim, agent, stop.signal, state, log);
    // Committed before the platform's tests run, so files the tests leave behind (reports,
    // caches) never end up in the pull request.
    await commit(deps, claim, agent, stop.signal, state);
    const check = await verify(deps, claim, stop.signal, state);
    await publish(deps, claim, agent, { ...implemented, restoredTests }, check, stop.signal, state);
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
  /** The step in progress, closed by `failRun` when the run stops. */
  step: Step | undefined;
  repoDir: string;
  branch: string | undefined;
  /** When the run's time limit ends (ms since epoch). */
  deadline: number;
}

interface LoadedAgent extends LoadedAgentPreset {
  model: AgentModel;
}

interface Implemented {
  result: CoderResult;
  iterations: number;
}

/** Most paths named in a run error message. */
const PATHS_IN_MESSAGE = 10;

function listPaths(paths: string[]): string {
  const shown = paths.slice(0, PATHS_IN_MESSAGE).join(', ');
  return paths.length > PATHS_IN_MESSAGE
    ? `${shown} and ${paths.length - PATHS_IN_MESSAGE} more`
    : shown;
}

/** Globs of test files the agent may add to but not change, or none for agents that may. */
function protectedTestGlobs({ project }: ClaimedRun, { preset }: LoadedAgentPreset): string[] {
  if (preset.permissions.existingTests !== 'read-only') return [];
  return [...new Set([...project.testPolicy.testPaths, ...EXTRA_TEST_GLOBS])];
}

function runLimitMs(deps: RunnerDeps, { project }: ClaimedRun): number {
  const minutes = project.settings.limits?.maxRunMinutes;
  return minutes === undefined ? deps.config.maxRunMs : minutes * 60_000;
}

/** The agent and its model; checked before anything is cloned, so a setup error fails fast. */
async function loadAgent(deps: RunnerDeps, claim: ClaimedRun): Promise<LoadedAgent> {
  let loaded: LoadedAgentPreset;
  try {
    loaded = await deps.loadAgentPreset(CODER_AGENT_KEY);
  } catch (error) {
    throw new RunFailure('agent_preset_invalid', describe(error), { cause: error });
  }
  const model = await deps.openAgentModel(claim.workspaceId, loaded);
  return { ...loaded, model };
}

async function prepare(
  deps: RunnerDeps,
  { workspaceId, run, task, project }: ClaimedRun,
  signal: AbortSignal,
  state: RunState,
  log: Logger,
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

  const url = `${deps.config.gitHostUrl}/${repoOwner}/${repoName}.git`;
  const branch = agentBranchName(task.id, task.title);
  try {
    await deps.git.clone({
      url,
      dir: state.repoDir,
      branch: project.defaultBranch,
      token: state.token,
      signal,
    });
    await deps.git.createBranch(state.repoDir, branch, signal);
  } catch (error) {
    signal.throwIfAborted();
    throw new RunFailure(
      'clone_failed',
      `Cloning ${repoOwner}/${repoName} (branch ${project.defaultBranch}) failed: ${describe(error)}`,
      { cause: error },
    );
  }
  state.branch = branch;
  await updateRun(deps.db, workspaceId, run.id, { branch });

  try {
    state.sandbox = await deps.sandboxes.create({
      runId: run.id,
      workspaceDir: state.repoDir,
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
    await keepTreeClean(deps, install, signal, state, log);
  }
}

/**
 * Whatever install changed in the repository would be committed as the agent's work.
 * Tracked files it rewrote (e.g. a lockfile of another npm version) are put back; new files
 * that `.gitignore` does not cover stop the run, so the project can ignore them.
 */
async function keepTreeClean(
  deps: RunnerDeps,
  install: string,
  signal: AbortSignal,
  state: RunState,
  log: Logger,
): Promise<void> {
  const changes = await deps.git.workingChanges(state.repoDir, signal);
  const created = changes.filter((file) => file.status === 'added').map((file) => file.path);
  if (created.length > 0) {
    throw new RunFailure(
      'install_changed_files',
      `The install command \`${install}\` created files that .gitignore does not cover: ` +
        `${listPaths(created)}. Add them to .gitignore, so they do not end up in the pull request.`,
    );
  }
  const rewritten = changes.map((file) => file.path);
  if (rewritten.length > 0) {
    await deps.git.restoreFiles(state.repoDir, 'HEAD', rewritten, signal);
    log.warn({ files: rewritten }, 'Install changed tracked files; they were restored');
  }
}

/**
 * Commands the agent may run (e.g. `lint -- --fix`, `test -- -u`) can rewrite existing tests,
 * which the file tools refuse. Such changes are undone and reported in the pull request.
 */
async function restoreExistingTests(
  deps: RunnerDeps,
  claim: ClaimedRun,
  agent: LoadedAgent,
  signal: AbortSignal,
  state: RunState,
  log: Logger,
): Promise<string[]> {
  const globs = protectedTestGlobs(claim, agent);
  if (globs.length === 0) return [];
  // No commit exists on the branch yet, so HEAD is the base the tests come from; a file
  // shown as modified or deleted existed there.
  const changed = (await deps.git.workingChanges(state.repoDir, signal))
    .filter((file) => file.status !== 'added')
    .map((file) => file.path)
    .filter((file) => globs.some((glob) => matchesPath(file, glob)));
  if (changed.length > 0) {
    await deps.git.restoreFiles(state.repoDir, 'HEAD', changed, signal);
    log.warn({ files: changed }, 'The agent changed existing tests; they were restored');
  }
  return changed;
}

/** Commands `run_command` accepts: the project's, without the long-running `dev`. */
export function allowedCommands(commands: ProjectCommands): AllowedCommand[] {
  const allowed: AllowedCommand[] = [];
  // `install` takes no arguments: `npm install <package>` would add a dependency.
  if (commands.install) allowed.push({ command: commands.install, allowArgs: false });
  for (const command of [commands.build, commands.lint, commands.test, commands.coverage]) {
    if (command) allowed.push({ command, allowArgs: true });
  }
  return allowed;
}

/** The `implement` step: the agent works in the sandbox until it calls `finish`. */
async function implement(
  deps: RunnerDeps,
  claim: ClaimedRun,
  agent: LoadedAgent,
  signal: AbortSignal,
  state: RunState,
  log: Logger,
): Promise<Implemented> {
  const { workspaceId, run, task, project } = claim;
  const sandbox = state.sandbox;
  if (!sandbox) throw new Error('implement() needs a prepared run');
  const { preset } = agent;
  const limits = project.settings.limits ?? {};
  const maxIterations = limits.maxIterations ?? preset.limits.maxIterations;
  const maxCostUsd = limits.maxRunCostUsd ?? PLATFORM_RUN_LIMITS.maxRunCostUsd;

  await updateRun(deps.db, workspaceId, run.id, { status: 'running' });
  const step = await startStep(deps.db, workspaceId, run.id, {
    stepKey: 'implement',
    agentKey: preset.key,
    agentVersion: agent.version,
    input: { model: agent.model.modelId, limits: { maxIterations, maxCostUsd } },
  });
  if (!step) throw new Error('The run is no longer open');
  state.step = step;

  const onEvent = async (event: AgentEvent): Promise<void> => {
    if (event.type === 'model-response') {
      await addStepUsage(deps.db, workspaceId, step.id, {
        costUsd: event.costUsd,
        tokensIn: event.inputTokens,
        tokensOut: event.outputTokens,
      });
    } else if (event.type === 'tool-call') {
      await createToolCall(deps.db, workspaceId, step.id, {
        tool: event.tool,
        args: event.args,
        result: truncateToolResult(redactToken(event.result, state.token)),
        isError: event.isError,
        durationMs: event.durationMs,
        exitCode: event.exitCode,
      });
    }
  };

  const protectedGlobs = protectedTestGlobs(claim, agent);
  const input: AgentRunInput = {
    agent: {
      key: preset.key,
      systemPrompt: agent.systemPrompt,
      tools: preset.tools,
      permissions: { writeGlobs: preset.permissions.write, protectedGlobs },
      resultSchema: agentResultSchemas[preset.result],
      model: { id: agent.model.modelId, pricing: agent.model.pricing },
      ...(preset.params.maxTokens === undefined ? {} : { maxTokens: preset.params.maxTokens }),
      ...(preset.params.temperature === undefined
        ? {}
        : { temperature: preset.params.temperature }),
    },
    task: {
      title: task.title,
      description: task.description,
      acceptanceCriteria: parseAcceptanceCriteria(task.acceptanceCriteria),
    },
    sandbox,
    commands: { allowed: allowedCommands(project.settings.commands) },
    git: { baseRef: `origin/${project.defaultBranch}` },
    limits: {
      maxIterations,
      maxCostUsd,
      maxDurationMs: Math.max(1, state.deadline - Date.now()),
      commandTimeoutMs: deps.config.commandTimeoutMs,
    },
    signal,
    onEvent,
  };

  const runtime = createNativeRuntime({
    llm: agent.model.llm,
    onToolError: (error, call) => log.error({ err: error, ...call }, 'Agent tool failed'),
  });
  const outcome = await runtime.run(input);

  const usage = { iterations: outcome.usage.iterations, costUsd: outcome.usage.costUsd };
  if (outcome.status !== 'succeeded') {
    // A cancelled step means the run's stop signal fired; `failRun` tells why.
    signal.throwIfAborted();
    if (outcome.status === 'cancelled') {
      throw new RunFailure('internal_error', 'The agent step stopped without a reason');
    }
    await finishStep(deps.db, workspaceId, step.id, {
      status: 'failed',
      output: { error: { ...outcome.error }, usage } as JsonValue,
    });
    state.step = undefined;
    const message =
      outcome.error.code === 'cost_limit'
        ? `The run cost ${outcome.usage.costUsd.toFixed(4)} USD, over its limit of ${maxCostUsd} USD.`
        : outcome.error.message;
    throw new RunFailure(outcome.error.code as RunFailureCode, message);
  }

  const result = outcome.output as CoderResult;
  await finishStep(deps.db, workspaceId, step.id, {
    status: 'succeeded',
    output: { result, usage } as JsonValue,
  });
  state.step = undefined;
  return { result, iterations: outcome.usage.iterations };
}

/** The `check` step: the project's tests, run by the platform. Failing tests are reported, not fatal. */
async function verify(
  deps: RunnerDeps,
  { workspaceId, run, project }: ClaimedRun,
  signal: AbortSignal,
  state: RunState,
): Promise<CheckReport> {
  const sandbox = state.sandbox;
  const command = project.settings.commands.test;
  if (!sandbox || !command) throw new Error('verify() needs a prepared run');

  const step = await startStep(deps.db, workspaceId, run.id, {
    stepKey: 'check',
    ...PLATFORM_CHECK,
    input: { command },
  });
  if (!step) throw new Error('The run is no longer open');
  state.step = step;

  const result = await sandbox.exec(command, { timeoutMs: deps.config.commandTimeoutMs, signal });
  signal.throwIfAborted();
  const passed = result.exitCode === 0 && !result.timedOut;
  const output = redactToken(result.output, state.token);

  await createToolCall(deps.db, workspaceId, step.id, {
    tool: 'run_command',
    args: { command },
    result: truncateToolResult(output),
    isError: !passed,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
  });
  await finishStep(deps.db, workspaceId, step.id, {
    status: passed ? 'succeeded' : 'failed',
    output: { exitCode: result.exitCode, timedOut: result.timedOut, truncated: result.truncated },
  });
  state.step = undefined;
  return { command, passed, exitCode: result.exitCode, timedOut: result.timedOut, output };
}

/** Commits the agent's work on the host (locally; `publish` pushes it). */
async function commit(
  deps: RunnerDeps,
  { run, task }: ClaimedRun,
  agent: LoadedAgent,
  signal: AbortSignal,
  state: RunState,
): Promise<void> {
  const sha = await deps.git.commitAll(state.repoDir, {
    message: [
      pullRequestTitle(task.title),
      '',
      `AIEvo-Task: ${task.id}`,
      `AIEvo-Run: ${run.id}`,
      `AIEvo-Agent: ${agent.preset.key}@${agent.version}`,
    ].join('\n'),
    author: { name: `AIEvo ${agent.preset.name}`, email: deps.config.gitAuthorEmail },
    signal,
  });
  if (sha === null) {
    throw new RunFailure(
      'no_changes',
      'The agent finished without changing any file, so there is nothing to commit',
    );
  }
}

/** Push the agent branch and open the pull request. */
async function publish(
  deps: RunnerDeps,
  { workspaceId, run, task, project }: ClaimedRun,
  agent: LoadedAgent,
  implemented: Implemented & { restoredTests: string[] },
  check: CheckReport,
  signal: AbortSignal,
  state: RunState,
): Promise<void> {
  const { token, branch, repoDir } = state;
  const { repoOwner, repoName } = project;
  if (!token || !branch || !repoOwner || !repoName)
    throw new Error('publish() needs a prepared run');

  await updateRun(deps.db, workspaceId, run.id, { status: 'committing' });
  try {
    await deps.git.pushAgentBranch(repoDir, {
      branch,
      baseBranch: project.defaultBranch,
      token,
      signal,
    });
  } catch (error) {
    signal.throwIfAborted();
    throw new RunFailure('push_failed', `Pushing the branch ${branch} failed: ${describe(error)}`, {
      cause: error,
    });
  }
  const changedFiles = await deps.git.changedFiles(
    repoDir,
    `origin/${project.defaultBranch}`,
    signal,
  );

  const totals = await getRun(deps.db, workspaceId, run.id);
  const body = pullRequestBody({
    task: {
      title: task.title,
      description: task.description,
      acceptanceCriteria: parseAcceptanceCriteria(task.acceptanceCriteria),
    },
    result: implemented.result,
    changedFiles,
    restoredTests: implemented.restoredTests,
    check,
    run: {
      url: `${deps.config.webUrl.replace(/\/+$/, '')}/runs/${run.id}`,
      iterations: implemented.iterations,
      tokensIn: totals?.tokensIn ?? 0,
      tokensOut: totals?.tokensOut ?? 0,
      costUsd: totals?.costUsd ?? 0,
      model: agent.model.displayName,
      agent: `${agent.preset.name} (${agent.preset.key}@${agent.version})`,
    },
  });

  let pr;
  try {
    pr = await deps.gitProvider(token).createPullRequest({
      owner: repoOwner,
      repo: repoName,
      head: branch,
      base: project.defaultBranch,
      title: pullRequestTitle(task.title),
      body,
    });
  } catch (error) {
    signal.throwIfAborted();
    throw new RunFailure(
      'pr_failed',
      `The branch ${branch} was pushed, but opening the pull request failed: ${describe(error)}`,
      { cause: error },
    );
  }
  await setRunPullRequest(deps.db, workspaceId, run.id, pr);
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
function watchStopReasons(
  deps: RunnerDeps,
  claim: ClaimedRun,
  maxRunMs: number,
  shutdown: AbortSignal,
) {
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

  const timer = setTimeout(() => stopWith('timeout'), maxRunMs);
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

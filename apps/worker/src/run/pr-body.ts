import type { ChangedFile } from '@aievo/git';
import type { CoderResult } from '@aievo/shared';

/** What the platform ran itself after the agent finished (the `check` step). */
export interface CheckReport {
  command: string;
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  output: string;
}

export interface PullRequestData {
  task: { title: string; description: string; acceptanceCriteria: string[] };
  /** The agent's `finish` result. */
  result: CoderResult;
  /** From git, not from the agent. */
  changedFiles: ChangedFile[];
  /** Existing tests the agent's commands changed and the platform put back. */
  restoredTests: string[];
  check: CheckReport;
  run: {
    url: string;
    iterations: number;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    model: string;
    agent: string;
  };
}

/** GitHub refuses longer titles and bodies. */
const TITLE_MAX = 256;
const BODY_MAX = 65_536;
/** Room kept for the note that the body was cut. */
const BODY_RESERVE = 200;
const OUTPUT_TAIL_LINES = 60;
const FILES_SHOWN = 200;

const STATUS_LABEL: Record<ChangedFile['status'], string> = {
  added: 'added',
  modified: 'modified',
  deleted: 'deleted',
};

function tail(text: string, lines: number): string {
  const all = text.trimEnd().split('\n');
  return all.length > lines ? all.slice(-lines).join('\n') : all.join('\n');
}

/** A code fence longer than any run of backticks in `text`, so the text cannot close it. */
function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
}

function list(items: string[]): string {
  return items.map((item) => `- ${item.replace(/\n/g, ' ')}`).join('\n');
}

export function pullRequestTitle(taskTitle: string): string {
  const title = taskTitle.trim().replace(/\s+/g, ' ');
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

/**
 * The description of the pull request, built from the data of the run (never written by the
 * model): the task, the agent's summary, the changed files from git, the test result from the
 * platform's own run and the usage of the run.
 */
export function pullRequestBody(data: PullRequestData): string {
  const full = renderBody(data, true);
  if (full.length <= BODY_MAX) return full;
  // The test output is the bulkiest part and is kept in the run anyway.
  const withoutOutput = renderBody(data, false);
  if (withoutOutput.length <= BODY_MAX) return withoutOutput;
  // Cut at a paragraph boundary, so no code block or list item is left half open.
  const room = withoutOutput.slice(0, BODY_MAX - BODY_RESERVE);
  const cut = room.lastIndexOf('\n\n');
  return (
    (cut > 0 ? room.slice(0, cut) : room) +
    `\n\n…\n\n_The description was too long and was cut; see the run in AIEvo: ${data.run.url}_\n`
  );
}

function renderBody(
  { task, result, changedFiles, restoredTests, check, run }: PullRequestData,
  withOutput: boolean,
): string {
  const sections: string[] = [];

  sections.push(`## Task\n\n**${task.title.trim()}**`);
  if (task.description.trim()) sections.push(task.description.trim());
  if (task.acceptanceCriteria.length > 0) {
    sections.push(`### Acceptance criteria\n\n${list(task.acceptanceCriteria)}`);
  }

  sections.push(`## Summary\n\n${result.summary.trim()}`);

  const shown = changedFiles.slice(0, FILES_SHOWN);
  const files = shown.map((file) => `- \`${file.path}\` (${STATUS_LABEL[file.status]})`);
  if (changedFiles.length > shown.length) {
    files.push(`- … and ${changedFiles.length - shown.length} more`);
  }
  sections.push(`## Changed files (${changedFiles.length})\n\n${files.join('\n')}`);

  const status = check.timedOut
    ? '❌ timed out'
    : check.passed
      ? '✅ passed'
      : `❌ failed (exit code ${String(check.exitCode)})`;
  const agentTests = result.tests.passed ? 'passed' : 'did not pass';
  const agentCommands =
    result.tests.commands.length > 0
      ? ` (${result.tests.commands.map((command) => `\`${command}\``).join(', ')})`
      : '';
  sections.push(
    [
      '## Tests',
      `Run by AIEvo after the agent finished: \`${check.command}\` ${status}`,
      withOutput
        ? `<details><summary>Output (last ${OUTPUT_TAIL_LINES} lines)</summary>\n\n${fenced(tail(check.output, OUTPUT_TAIL_LINES) || '(no output)')}\n\n</details>`
        : `_The output is too long for this description; see it in the run: ${run.url}_`,
      `Reported by the agent${agentCommands}: ${agentTests}, ${result.tests.summary.trim()}`,
    ].join('\n\n'),
  );

  if (restoredTests.length > 0) {
    sections.push(
      [
        '## Existing tests restored',
        'Commands the agent ran changed these existing test files. This agent may not change ' +
          'existing tests, so AIEvo put them back as they are on the base branch:',
        list(restoredTests.map((file) => `\`${file}\``)),
      ].join('\n\n'),
    );
  }

  if (result.openIssues.length > 0) {
    sections.push(`## Open issues\n\n${list(result.openIssues)}`);
  }

  sections.push(
    [
      '## Run',
      [
        `- Agent: ${run.agent}, model ${run.model}`,
        `- Iterations: ${run.iterations}`,
        `- Tokens: ${run.tokensIn.toLocaleString('en-US')} in, ${run.tokensOut.toLocaleString('en-US')} out`,
        `- Cost: ${run.costUsd.toFixed(4)} USD`,
        `- Details: ${run.url}`,
      ].join('\n'),
    ].join('\n\n'),
  );

  return sections.join('\n\n') + '\n';
}

/** Acceptance criteria of a task, stored as text: one per line, list markers removed. */
export function parseAcceptanceCriteria(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())
    .filter((line) => line !== '');
}

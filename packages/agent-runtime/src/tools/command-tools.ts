import { WORKSPACE_DIR } from '@aievo/sandbox';
import { z } from 'zod';

import { resolveToolPath } from './paths.js';
import { isAllowedCommand, shellQuote } from './shell.js';
import { ToolError, defineTool } from './tool.js';

/** Lines of command output the model gets. */
export const COMMAND_OUTPUT_LINES = 200;
/** Limit of the helper commands behind `search_code` and `git_diff`. */
const HELPER_TIMEOUT_MS = 60_000;
/** Longest line `search_code` shows; minified files would flood the result. */
const SEARCH_MAX_COLUMNS = 300;
const DIFF_OUTPUT_LINES = 3000;

export const runCommandTool = defineTool({
  name: 'run_command',
  description:
    'Run one of the allowed project commands (install, build, lint, test, coverage and the ' +
    'configured extra ones) in /workspace. Plain arguments may be appended, e.g. ' +
    '"npm test -- src/math.test.ts"; shell syntax (quotes, ;, |, &, $, redirections) is refused. ' +
    `Returns the exit code and the last ${COMMAND_OUTPUT_LINES} lines of output.`,
  input: z.object({ command: z.string().min(1) }),
  async execute({ command }, context) {
    const allowed = context.commands.allowed;
    if (!isAllowedCommand(command, allowed)) {
      const list = allowed.length > 0 ? allowed.map((entry) => `- ${entry}`).join('\n') : '(none)';
      throw new ToolError(
        `This command is not allowed. Allowed commands (optionally followed by plain arguments):\n${list}`,
      );
    }
    const result = await context.sandbox.exec(command.trim(), {
      timeoutMs: context.limits.commandTimeoutMs,
      signal: context.signal,
      tailLines: COMMAND_OUTPUT_LINES,
    });
    const status = result.timedOut
      ? `Timed out after ${Math.round(context.limits.commandTimeoutMs / 1000)} s`
      : `Exit code: ${String(result.exitCode)}`;
    const cut = result.truncated
      ? `[earlier output cut; last ${COMMAND_OUTPUT_LINES} lines]\n`
      : '';
    return {
      output: `${status}\n${cut}${result.output}`,
      isError: result.exitCode !== 0,
      exitCode: result.exitCode,
    };
  },
});

export const searchCodeTool = defineTool({
  name: 'search_code',
  description:
    'Search file contents with ripgrep (honours .gitignore). Plain text by default; set ' +
    '`regex: true` for a Rust regex. Returns "path:line:text" lines.',
  input: z.object({
    pattern: z.string().min(1),
    regex: z.boolean().default(false),
    path: z.string().default('.').describe('Directory or file relative to /workspace'),
    glob: z.string().min(1).optional().describe('Only files matching this glob, e.g. "*.ts"'),
    caseSensitive: z.boolean().default(true),
    maxResults: z.number().int().min(1).max(500).default(100),
  }),
  async execute({ pattern, regex, path, glob, caseSensitive, maxResults }, context) {
    const target = await resolveToolPath(context, path);
    const args = [
      'rg',
      '--line-number',
      '--no-heading',
      '--with-filename',
      '--color=never',
      '--hidden',
      "--glob='!.git'",
      `--max-columns=${SEARCH_MAX_COLUMNS}`,
      '--max-columns-preview',
      ...(regex ? [] : ['--fixed-strings']),
      ...(caseSensitive ? [] : ['--ignore-case']),
      ...(glob ? [`--glob=${shellQuote(glob)}`] : []),
      '-e',
      shellQuote(pattern),
      // Without a path ripgrep searches the working directory and prints paths without `./`.
      ...(target.relative === '.' ? [] : ['--', shellQuote(target.relative)]),
    ];
    // One line past the limit tells whether results were cut. ripgrep's own status is kept.
    const command = `${args.join(' ')} 2>&1 | head -n ${maxResults + 1}; exit "\${PIPESTATUS[0]}"`;
    const result = await context.sandbox.exec(command, {
      cwd: WORKSPACE_DIR,
      timeoutMs: HELPER_TIMEOUT_MS,
      signal: context.signal,
      tailLines: maxResults + 1,
    });
    if (result.exitCode === 1) return { output: 'No matches.' };
    // 141: ripgrep stopped by `head` once enough lines were read.
    if (result.exitCode !== 0 && result.exitCode !== 141) {
      throw new ToolError(`Search failed: ${result.output.trim() || 'ripgrep error'}`);
    }
    const lines = result.output.split('\n').filter((line) => line !== '');
    const shown = lines.slice(0, maxResults);
    const note =
      lines.length > maxResults ? `\n[more than ${maxResults} matches; refine the search]` : '';
    return { output: shown.join('\n') + note };
  },
});

export const gitDiffTool = defineTool({
  name: 'git_diff',
  description:
    'Show the changes in the working copy against the base branch, including new untracked ' +
    'files. Optionally limited to one path.',
  input: z.object({
    path: z.string().default('.').describe('File or directory relative to /workspace'),
  }),
  async execute({ path }, context) {
    const target = await resolveToolPath(context, path);
    const scope = shellQuote(target.relative);
    // `.git` is mounted read-only, so nothing here may write the index: new files are shown
    // with `--no-index` against /dev/null instead of being added with intent-to-add.
    const script = [
      `g() { git -c 'safe.directory=*' -c core.quotepath=off "$@"; }`,
      `g diff --no-color --no-ext-diff --no-textconv ${shellQuote(context.git.baseRef)} -- ${scope} || exit $?`,
      `g ls-files --others --exclude-standard -z -- ${scope} | while IFS= read -r -d '' f; do`,
      `  g diff --no-color --no-ext-diff --no-index -- /dev/null "$f"`,
      'done',
      'exit 0',
    ].join('\n');
    const result = await context.sandbox.exec(script, {
      cwd: WORKSPACE_DIR,
      timeoutMs: HELPER_TIMEOUT_MS,
      signal: context.signal,
      tailLines: DIFF_OUTPUT_LINES,
    });
    if (result.exitCode !== 0) {
      throw new ToolError(`git diff failed: ${result.output.trim() || 'unknown error'}`);
    }
    if (result.output.trim() === '')
      return { output: `No changes against ${context.git.baseRef}.` };
    const cut = result.truncated
      ? `[diff too long; only its last ${DIFF_OUTPUT_LINES} lines]\n`
      : '';
    return { output: cut + result.output };
  },
});

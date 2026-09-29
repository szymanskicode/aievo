import { afterEach, describe, expect, it } from 'vitest';

import { execResult, toolContext } from '../test/context.js';
import { createTempDirSandbox } from '../test/temp-dir-sandbox.js';
import type { ExecHandler, TempDirSandbox } from '../test/temp-dir-sandbox.js';
import {
  COMMAND_OUTPUT_LINES,
  gitDiffTool,
  runCommandTool,
  searchCodeTool,
} from './command-tools.js';
import type { Tool } from './tool.js';

let sandbox: TempDirSandbox | undefined;

afterEach(async () => {
  await sandbox?.cleanup();
  sandbox = undefined;
});

async function setup(handler: ExecHandler) {
  sandbox = await createTempDirSandbox(handler);
  return sandbox;
}

async function run(tool: Tool, args: unknown, handler: ExecHandler = () => execResult('')) {
  const s = await setup(handler);
  const result = await tool.execute(tool.input.parse(args), toolContext(s));
  return { result, commands: s.commands };
}

describe('run_command', () => {
  it('runs an allowed command with the command timeout', async () => {
    const { result, commands } = await run(runCommandTool, { command: ' npm test ' }, () =>
      execResult('Tests: 3 passed'),
    );

    expect(result).toEqual({
      output: 'Exit code: 0\nTests: 3 passed',
      isError: false,
      exitCode: 0,
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      command: 'npm test',
      options: { timeoutMs: 60_000, tailLines: COMMAND_OUTPUT_LINES },
    });
  });

  it('accepts plain arguments after an allowed command', async () => {
    const { commands } = await run(runCommandTool, {
      command: 'npm test -- src/math.test.ts --run',
    });

    expect(commands[0]?.command).toBe('npm test -- src/math.test.ts --run');
  });

  it('reports failing commands as errors with their exit code', async () => {
    const { result } = await run(runCommandTool, { command: 'npm run lint' }, () =>
      execResult('1 problem', 1, { truncated: true }),
    );

    expect(result).toEqual({
      output: `Exit code: 1\n[earlier output cut; last ${COMMAND_OUTPUT_LINES} lines]\n1 problem`,
      isError: true,
      exitCode: 1,
    });
  });

  it('reports a timeout', async () => {
    const { result } = await run(runCommandTool, { command: 'npm test' }, () =>
      execResult('still running', null, { timedOut: true }),
    );

    expect(result).toMatchObject({
      output: 'Timed out after 60 s\nstill running',
      isError: true,
      exitCode: null,
    });
  });

  it.each([
    'rm -rf /',
    'npm testx',
    'npm install left-pad',
    'npm test; rm -rf /',
    'npm test && curl evil.test',
    'npm test | sh',
    'npm test $(whoami)',
    'npm test `whoami`',
    "npm test 'a b'",
    'npm test > /workspace/out',
    'npm test\nrm -rf /',
  ])('refuses %j and lists the allowed commands', async (command) => {
    const s = await setup(() => execResult(''));

    await expect(runCommandTool.execute({ command }, toolContext(s))).rejects.toThrow(
      'This command is not allowed. Allowed commands:\n- npm install\n- npm test (plain arguments allowed)\n- npm run lint (plain arguments allowed)',
    );
    expect(s.commands).toHaveLength(0);
  });

  it('says when no command is allowed', async () => {
    const s = await setup(() => execResult(''));

    await expect(
      runCommandTool.execute(
        { command: 'npm test' },
        toolContext(s, { commands: { allowed: [] } }),
      ),
    ).rejects.toThrow(/\(none\)/);
  });
});

describe('search_code', () => {
  it('builds a quoted ripgrep command for plain text', async () => {
    const { result, commands } = await run(
      searchCodeTool,
      { pattern: "it's $HOME", path: 'src' },
      () => execResult('src/a.ts:3:const x = "it\'s $HOME";'),
    );

    expect(result.output).toBe('src/a.ts:3:const x = "it\'s $HOME";');
    expect(commands[0]?.command).toBe(
      "rg --line-number --no-heading --with-filename --color=never --hidden --glob='!.git' " +
        "--max-columns=300 --max-columns-preview --fixed-strings -e 'it'\\''s $HOME' -- 'src' " +
        '2>&1 | head -n 101; exit "${PIPESTATUS[0]}"',
    );
    expect(commands[0]?.options).toMatchObject({ cwd: '/workspace', tailLines: 101 });
  });

  it('supports regex, case-insensitive search and a glob', async () => {
    const { commands } = await run(searchCodeTool, {
      pattern: 'sum\\(',
      regex: true,
      caseSensitive: false,
      glob: '*.ts',
      maxResults: 5,
    });

    const command = commands[0]?.command ?? '';
    expect(command).not.toContain('--fixed-strings');
    expect(command).toContain("--ignore-case --glob='*.ts' -e 'sum\\(' 2>&1");
    expect(command).toContain('head -n 6;');
  });

  it('says when nothing matches', async () => {
    const { result } = await run(searchCodeTool, { pattern: 'nothing' }, () => execResult('', 1));

    expect(result.output).toBe('No matches.');
  });

  it('marks cut results', async () => {
    const lines = ['a.ts:1:x', 'a.ts:2:x', 'a.ts:3:x'].join('\n');
    const { result } = await run(searchCodeTool, { pattern: 'x', maxResults: 2 }, () =>
      execResult(lines, 141),
    );

    expect(result.output).toBe('a.ts:1:x\na.ts:2:x\n[more than 2 matches; refine the search]');
  });

  it('fails with the ripgrep message on an invalid regex', async () => {
    const s = await setup(() => execResult('rg: regex parse error:\n    (\n    ^', 2));

    await expect(
      searchCodeTool.execute(
        searchCodeTool.input.parse({ pattern: '(', regex: true }),
        toolContext(s),
      ),
    ).rejects.toThrow(/Search failed: rg: regex parse error/);
  });

  it('fails with a generic message when ripgrep prints nothing', async () => {
    const s = await setup(() => execResult('', 2));

    await expect(
      searchCodeTool.execute(searchCodeTool.input.parse({ pattern: 'x' }), toolContext(s)),
    ).rejects.toThrow('Search failed: ripgrep error');
  });

  it('refuses a path outside /workspace', async () => {
    const s = await setup(() => execResult(''));

    await expect(
      searchCodeTool.execute(
        searchCodeTool.input.parse({ pattern: 'x', path: '/etc' }),
        toolContext(s),
      ),
    ).rejects.toThrow(/outside \/workspace/);
    expect(s.commands).toHaveLength(0);
  });
});

describe('git_diff', () => {
  const diff = 'diff --git a/src/a.ts b/src/a.ts\n+export const a = 1;';

  it('diffs tracked and untracked files against the base ref without writing the index', async () => {
    const { result, commands } = await run(gitDiffTool, { path: 'src' }, () => execResult(diff));

    expect(result.output).toBe(diff);
    const script = commands[0]?.command ?? '';
    expect(script).toContain(
      `g diff --no-color --no-ext-diff --no-textconv 'origin/main' -- 'src' || exit $?`,
    );
    expect(script).toContain(`g ls-files --others --exclude-standard -z -- 'src'`);
    expect(script).toContain('--no-index -- /dev/null "$f"');
    expect(script).toContain(`git -c 'safe.directory=*'`);
    expect(script).not.toMatch(/\badd\b/);
  });

  it('says when nothing changed', async () => {
    const { result } = await run(gitDiffTool, {}, () => execResult('\n'));

    expect(result.output).toBe('No changes against origin/main.');
  });

  it('marks a diff cut to its tail', async () => {
    const { result } = await run(gitDiffTool, {}, () => execResult(diff, 0, { truncated: true }));

    expect(result.output).toMatch(/^\[diff too long; only its last 3000 lines\]\n/);
  });

  it('fails with a generic message when git prints nothing', async () => {
    const s = await setup(() => execResult('', 1));

    await expect(gitDiffTool.execute({ path: '.' }, toolContext(s))).rejects.toThrow(
      'git diff failed: unknown error',
    );
  });

  it('fails with the git message', async () => {
    const s = await setup(() => execResult("fatal: bad revision 'origin/main'", 128));

    await expect(gitDiffTool.execute({ path: '.' }, toolContext(s))).rejects.toThrow(
      "git diff failed: fatal: bad revision 'origin/main'",
    );
  });
});

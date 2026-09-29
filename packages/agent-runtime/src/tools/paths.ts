import { WORKSPACE_DIR, resolveWorkspacePath, toWorkspaceRelative } from '@aievo/sandbox';

import { matchesPath } from './glob.js';
import { shellQuote } from './shell.js';
import type { ToolContext } from './tool.js';
import { ToolError } from './tool.js';

export interface ResolvedPath {
  /** Absolute container path with symlinks resolved; what sandbox operations get. */
  absolute: string;
  /** The same path relative to `/workspace` (`.` for the root). */
  relative: string;
}

function isInsideWorkspace(absolute: string): boolean {
  return absolute === WORKSPACE_DIR || absolute.startsWith(`${WORKSPACE_DIR}/`);
}

/**
 * Resolves a path given by the model. Refuses `..` and absolute paths outside `/workspace`,
 * and symlinks whose target is outside it.
 */
export async function resolveToolPath(context: ToolContext, input: string): Promise<ResolvedPath> {
  let lexical: string;
  try {
    lexical = resolveWorkspacePath(input);
  } catch {
    throw new ToolError(
      `The path "${input}" is outside /workspace. Use paths relative to /workspace.`,
    );
  }
  const absolute = await context.sandbox.realPath(lexical);
  if (!isInsideWorkspace(absolute)) {
    throw new ToolError(`The path "${input}" leads outside /workspace through a symbolic link.`);
  }
  const relative = toWorkspaceRelative(absolute) || '.';
  return { absolute, relative };
}

/** Like `resolveToolPath`, and also checks that the agent may write there. */
export async function resolveWritablePath(
  context: ToolContext,
  input: string,
): Promise<ResolvedPath> {
  const resolved = await resolveToolPath(context, input);
  const globs = context.permissions.writeGlobs;
  if (globs === null) {
    throw new ToolError('This agent may not write files.');
  }
  if (resolved.relative === '.' || resolved.relative.split('/').includes('.git')) {
    throw new ToolError(`Writing to "${input}" is not allowed: .git is managed by the platform.`);
  }
  if (!globs.some((glob) => matchesPath(resolved.relative, glob))) {
    throw new ToolError(
      `This agent may not write "${resolved.relative}". Allowed paths: ${globs.join(', ')}.`,
    );
  }
  const protectedGlobs = context.permissions.protectedGlobs ?? [];
  if (
    protectedGlobs.some((glob) => matchesPath(resolved.relative, glob)) &&
    (await existsInBase(context, resolved.relative))
  ) {
    throw new ToolError(
      `"${resolved.relative}" is an existing test file, and this agent may not change existing ` +
        'tests. Add new tests in a new file instead, or explain the problem in the result.',
    );
  }
  return resolved;
}

const BASE_CHECK_TIMEOUT_MS = 30_000;

/** Whether `relative` is a file of the base ref (not one the agent created in this run). */
async function existsInBase(context: ToolContext, relative: string): Promise<boolean> {
  const object = `${context.git.baseRef}:${relative}`;
  const result = await context.sandbox.exec(
    `git -c 'safe.directory=*' cat-file -e ${shellQuote(object)}`,
    { cwd: WORKSPACE_DIR, timeoutMs: BASE_CHECK_TIMEOUT_MS, signal: context.signal },
  );
  if (result.exitCode === 0) return true;
  // `cat-file -e` exits with 128 for a path the ref does not have; anything else is a failure,
  // and a check that cannot run must not let the write through.
  if (result.exitCode === 128 || result.exitCode === 1) return false;
  throw new ToolError(
    'Checking whether the file is an existing test failed; the write was refused.',
  );
}

import path from 'node:path';

import { WORKSPACE_DIR, resolveWorkspacePath, toWorkspaceRelative } from '@aievo/sandbox';

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
  if (!globs.some((glob) => path.posix.matchesGlob(resolved.relative, glob))) {
    throw new ToolError(
      `This agent may not write "${resolved.relative}". Allowed paths: ${globs.join(', ')}.`,
    );
  }
  return resolved;
}

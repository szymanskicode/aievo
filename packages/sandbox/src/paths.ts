import path from 'node:path';

import { SandboxError } from './errors.js';
import { WORKSPACE_DIR } from './sandbox.js';

/**
 * Absolute container path of `input` (relative to `/workspace` or absolute), refusing
 * anything that resolves outside `/workspace`.
 */
export function resolveWorkspacePath(input: string): string {
  if (input.includes('\0')) throw new SandboxError('path_outside_workspace');
  const resolved = path.posix.resolve(WORKSPACE_DIR, input.replace(/\\/g, '/'));
  if (resolved !== WORKSPACE_DIR && !resolved.startsWith(`${WORKSPACE_DIR}/`)) {
    throw new SandboxError('path_outside_workspace');
  }
  return resolved;
}

/** `input` relative to `/workspace`, for paths reported back to callers. */
export function toWorkspaceRelative(input: string): string {
  return path.posix.relative(WORKSPACE_DIR, path.posix.resolve(WORKSPACE_DIR, input));
}

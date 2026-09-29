export type SandboxErrorKind =
  | 'docker_unavailable'
  | 'image_missing'
  | 'start_failed'
  | 'path_outside_workspace'
  | 'file_not_found'
  | 'file_too_large'
  | 'command_failed'
  | 'aborted'
  | 'stopped';

const MESSAGES: Record<SandboxErrorKind, string> = {
  docker_unavailable: 'Docker is not reachable; start Docker and try again',
  image_missing: 'The sandbox image is missing; build it with `pnpm sandbox:build`',
  start_failed: 'The sandbox container could not be started',
  path_outside_workspace: 'The path is outside /workspace',
  file_not_found: 'The file does not exist',
  file_too_large: 'The file is larger than the read limit',
  command_failed: 'A sandbox command failed',
  aborted: 'The sandbox operation was aborted',
  stopped: 'The sandbox has been stopped',
};

/** A failed sandbox operation, with a fixed message safe to store and show. */
export class SandboxError extends Error {
  override name = 'SandboxError';

  constructor(
    readonly kind: SandboxErrorKind,
    options?: { cause?: unknown; detail?: string },
  ) {
    super(options?.detail ? `${MESSAGES[kind]}: ${options.detail}` : MESSAGES[kind], {
      cause: options?.cause,
    });
  }
}

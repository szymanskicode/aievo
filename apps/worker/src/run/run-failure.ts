import type { RunError } from '@aievo/shared';

/** Codes a failed run can end with; the UI shows them next to `message`. */
export type RunFailureCode =
  | 'project_not_linked'
  | 'test_command_missing'
  | 'git_credential_missing'
  | 'git_token_unreadable'
  | 'clone_failed'
  | 'sandbox_failed'
  | 'install_failed'
  | 'tests_failed'
  | 'tests_timed_out'
  | 'run_timeout'
  | 'worker_shutdown'
  | 'worker_restarted'
  | 'internal_error';

/** An expected way for a run to fail, stored as `run.error`. The message must hold no secrets. */
export class RunFailure extends Error {
  override name = 'RunFailure';

  constructor(
    readonly code: RunFailureCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }

  toRunError(): RunError {
    return { code: this.code, message: this.message };
  }
}

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
  | 'install_changed_files'
  | 'agent_preset_invalid'
  | 'agent_model_missing'
  | 'agent_model_unusable'
  | 'provider_key_unreadable'
  // Ways the agent step fails (`AgentErrorCode` of @aievo/agent-runtime).
  | 'model_not_priced'
  | 'iteration_limit'
  | 'cost_limit'
  | 'time_limit'
  | 'invalid_result'
  | 'model_error'
  | 'no_changes'
  | 'push_failed'
  | 'pr_failed'
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

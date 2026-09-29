export type LocalGitErrorKind =
  'forbidden_push' | 'invalid_branch' | 'command_failed' | 'timeout' | 'aborted' | 'git_missing';

const MESSAGES: Record<LocalGitErrorKind, string> = {
  forbidden_push: 'Only agent branches can be pushed, never the base branch',
  invalid_branch: 'The branch name is not a valid agent branch',
  command_failed: 'A git command failed',
  timeout: 'A git command did not finish in time',
  aborted: 'A git command was aborted',
  git_missing: 'The git binary was not found on this machine',
};

export interface LocalGitErrorDetails {
  /** The git subcommand, e.g. `clone`. */
  command?: string;
  exitCode?: number;
  /** End of git's stderr with the token removed. */
  output?: string;
}

/** A failed git operation on the host. Its details never contain the token. */
export class LocalGitError extends Error {
  override name = 'LocalGitError';

  constructor(
    readonly kind: LocalGitErrorKind,
    readonly details: LocalGitErrorDetails = {},
  ) {
    super(details.command ? `${MESSAGES[kind]} (git ${details.command})` : MESSAGES[kind]);
  }
}

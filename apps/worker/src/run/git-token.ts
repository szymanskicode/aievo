import { getGitCredential } from '@aievo/db';
import type { Db } from '@aievo/db';
import type { SecretBox } from '@aievo/shared/crypto';

import { RunFailure } from './run-failure.js';

/** Decrypts the Git token of a project for one run. */
export type OpenGitToken = (workspaceId: string, credentialId: string) => Promise<string>;

export function createGitTokenOpener(db: Db, secretBox: SecretBox): OpenGitToken {
  return async (workspaceId, credentialId) => {
    const credential = await getGitCredential(db, workspaceId, credentialId);
    if (!credential) {
      throw new RunFailure('git_credential_missing', 'The GitHub token of the project was removed');
    }
    try {
      return secretBox.decrypt(credential.encryptedToken);
    } catch (error) {
      throw new RunFailure(
        'git_token_unreadable',
        'The stored GitHub token cannot be decrypted (was AIEVO_MASTER_KEY changed?)',
        { cause: error },
      );
    }
  };
}

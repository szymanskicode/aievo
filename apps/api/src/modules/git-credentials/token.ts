import { getGitCredential, listGitCredentials } from '@aievo/db';
import type { Db, GitCredential } from '@aievo/db';
import { createGitHubProvider } from '@aievo/git';
import type { GitProvider } from '@aievo/git';
import { DecryptionError, keyHint } from '@aievo/shared/crypto';
import type { SecretBox } from '@aievo/shared/crypto';

import { ApiError, resourceNotFound, storedTokenUnreadable } from '../../errors.js';

/** The only place where a plaintext token is turned into what the database stores. */
export function sealToken(secretBox: SecretBox, token: string) {
  return { encryptedToken: secretBox.encrypt(token), tokenHint: keyHint(token) };
}

/** The plaintext token for a single GitHub call; a token that cannot be decrypted is a 409. */
function openToken(secretBox: SecretBox, encryptedToken: string): string {
  try {
    return secretBox.decrypt(encryptedToken);
  } catch (error) {
    if (error instanceof DecryptionError) throw storedTokenUnreadable();
    throw error;
  }
}

/**
 * The credential a GitHub call uses: the one named by `credentialId`, or the only one
 * of the workspace. Guessing between several would act on the wrong account.
 */
export async function resolveGitCredential(
  db: Db,
  workspaceId: string,
  credentialId: string | undefined,
): Promise<GitCredential> {
  if (credentialId !== undefined) {
    const credential = await getGitCredential(db, workspaceId, credentialId);
    if (!credential) throw resourceNotFound('Git credential');
    return credential;
  }

  const credentials = await listGitCredentials(db, workspaceId);
  const [only] = credentials;
  if (!only) {
    throw new ApiError(409, 'git_credential_missing', 'Add a GitHub token first');
  }
  if (credentials.length > 1) {
    throw new ApiError(
      400,
      'git_credential_ambiguous',
      'Several GitHub tokens are stored; choose one with the credentialId parameter',
    );
  }
  return only;
}

/**
 * A GitHub adapter holding the decrypted token only for the lifetime of this request,
 * with the credential it uses.
 */
export async function openGitHubCredential(
  { db, secretBox }: { db: Db; secretBox: SecretBox },
  workspaceId: string,
  credentialId: string | undefined,
): Promise<{ credential: GitCredential; github: GitProvider }> {
  const credential = await resolveGitCredential(db, workspaceId, credentialId);
  return {
    credential,
    github: createGitHubProvider(openToken(secretBox, credential.encryptedToken)),
  };
}

/** A GitHub adapter holding the decrypted token only for the lifetime of this request. */
export async function openGitHub(
  ctx: { db: Db; secretBox: SecretBox },
  workspaceId: string,
  credentialId: string | undefined,
): Promise<GitProvider> {
  return (await openGitHubCredential(ctx, workspaceId, credentialId)).github;
}

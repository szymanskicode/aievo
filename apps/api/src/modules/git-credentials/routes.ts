import {
  RowInUseError,
  createGitCredential,
  deleteGitCredential,
  listGitCredentials,
} from '@aievo/db';
import { createGitHubProvider } from '@aievo/git';
import type { TokenInfo } from '@aievo/git';
import {
  GITHUB_TOKEN_REQUIREMENTS,
  createGitCredentialSchema,
  createdGitCredentialSchema,
  gitCredentialSchema,
  idParamsSchema,
} from '@aievo/shared';
import { z } from 'zod';

import { ApiError, GIT_ERROR_STATUSES, resourceNotFound } from '../../errors.js';
import { defineRoute } from '../../http/route.js';
import { serializeGitCredential } from './serialize.js';
import { sealToken } from './token.js';

const tag = 'git';

/** What the user should double-check; GitHub cannot report everything up front. */
function tokenWarnings(info: TokenInfo): string[] {
  const warnings: string[] = [];
  if (info.expiresAt === null) {
    warnings.push('The token has no expiration date; create one that expires.');
  }
  if (info.tokenType !== 'classic') {
    warnings.push(
      'GitHub does not report the permissions of this token, so they are checked only ' +
        `when used. Required: ${GITHUB_TOKEN_REQUIREMENTS}`,
    );
  }
  return warnings;
}

export const gitCredentialRoutes = [
  defineRoute(
    {
      method: 'get',
      path: '/git-credentials',
      summary: 'List GitHub tokens (never the tokens themselves)',
      tag,
      status: 200,
      response: z.array(gitCredentialSchema),
    },
    async ({ db, workspaceId }) =>
      (await listGitCredentials(db, workspaceId)).map(serializeGitCredential),
  ),

  defineRoute(
    {
      method: 'post',
      path: '/git-credentials',
      summary: 'Check a GitHub token with GitHub and store it encrypted',
      tag,
      body: createGitCredentialSchema,
      status: 201,
      response: createdGitCredentialSchema,
      errors: GIT_ERROR_STATUSES,
    },
    async ({ db, secretBox, workspaceId, body }) => {
      // The plaintext token exists only for the duration of this call.
      const info = await createGitHubProvider(body.token).verifyToken();

      if (info.missingScopes.length > 0) {
        throw new ApiError(
          400,
          'git_token_insufficient',
          `The token lacks required scopes: ${info.missingScopes.join(', ')}`,
          { missingScopes: info.missingScopes },
        );
      }

      const row = await createGitCredential(db, workspaceId, {
        label: body.label,
        githubLogin: info.login,
        expiresAt: info.expiresAt,
        ...sealToken(secretBox, body.token),
      });
      return { ...serializeGitCredential(row), warnings: tokenWarnings(info) };
    },
  ),

  defineRoute(
    {
      method: 'delete',
      path: '/git-credentials/:id',
      summary: 'Delete a GitHub token that no project uses',
      tag,
      params: idParamsSchema,
      status: 204,
      errors: [404, 409],
    },
    async ({ db, workspaceId, params }) => {
      let deleted: boolean;
      try {
        deleted = await deleteGitCredential(db, workspaceId, params.id);
      } catch (error) {
        if (error instanceof RowInUseError) {
          throw new ApiError(
            409,
            'git_credential_in_use',
            'A project uses this token; connect the project to another token first',
          );
        }
        throw error;
      }
      if (!deleted) throw resourceNotFound('Git credential');
    },
  ),
];

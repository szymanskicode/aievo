import {
  githubCredentialQuerySchema,
  githubOwnerSchema,
  githubRepoSchema,
  githubReposQuerySchema,
} from '@aievo/shared';
import { z } from 'zod';

import { GIT_ERROR_STATUSES } from '../../errors.js';
import { defineRoute } from '../../http/route.js';
import { openGitHub } from '../git-credentials/token.js';

const tag = 'github';

// 400: several tokens and no `credentialId`; 409: no token or one that cannot be decrypted.
const errors = [400, 409, ...GIT_ERROR_STATUSES];

export const githubRoutes = [
  defineRoute(
    {
      method: 'get',
      path: '/github/owners',
      summary: 'List the GitHub account and organizations the token can create repositories for',
      tag,
      query: githubCredentialQuerySchema,
      status: 200,
      response: z.array(githubOwnerSchema),
      errors,
    },
    async (ctx) => (await openGitHub(ctx, ctx.workspaceId, ctx.query.credentialId)).listOwners(),
  ),

  defineRoute(
    {
      method: 'get',
      path: '/github/repos',
      summary: 'List the repositories of a GitHub account or organization',
      tag,
      query: githubReposQuerySchema,
      status: 200,
      response: z.array(githubRepoSchema),
      errors,
    },
    async (ctx) =>
      (await openGitHub(ctx, ctx.workspaceId, ctx.query.credentialId)).listRepos(ctx.query.owner),
  ),
];

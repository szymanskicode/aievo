import { z } from 'zod';

import { gitProviderSchema } from './enums.js';

/**
 * What a GitHub token needs (docs/architecture.md, section 10). Shown to the user, because
 * the permissions of a fine-grained token cannot be read back from the GitHub API.
 */
export const GITHUB_TOKEN_REQUIREMENTS =
  'Fine-grained token with access to all repositories: Administration, Contents and ' +
  'Pull requests (read and write), Metadata (read), with an expiration date.';

/** Body of `POST /git-credentials`. The token is stored encrypted and never returned. */
export const createGitCredentialSchema = z
  .strictObject({
    label: z.string().trim().min(1).max(200),
    token: z.string().trim().min(1).max(1024),
  })
  .meta({ id: 'CreateGitCredential' });

export type CreateGitCredentialInput = z.infer<typeof createGitCredentialSchema>;

/** A Git credential as returned by the API. The token itself never leaves the server. */
export const gitCredentialSchema = z
  .object({
    id: z.uuid(),
    provider: gitProviderSchema,
    label: z.string(),
    /** Last 4 characters of the token; `null` for tokens too short to hint. */
    tokenHint: z.string().nullable(),
    githubLogin: z.string(),
    /** `null` when GitHub reports no expiration date. */
    expiresAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'GitCredential' });

export type GitCredentialDto = z.infer<typeof gitCredentialSchema>;

/** Response of `POST /git-credentials`: the stored credential and what to double-check. */
export const createdGitCredentialSchema = gitCredentialSchema
  .extend({
    warnings: z.array(z.string()),
  })
  .meta({ id: 'CreatedGitCredential' });

export type CreatedGitCredentialDto = z.infer<typeof createdGitCredentialSchema>;

/** An account or organization the token can create repositories for. */
export const githubOwnerSchema = z
  .object({
    login: z.string(),
    type: z.enum(['user', 'organization']),
    avatarUrl: z.string().nullable(),
  })
  .meta({ id: 'GithubOwner' });

export type GithubOwnerDto = z.infer<typeof githubOwnerSchema>;

export const githubRepoSchema = z
  .object({
    owner: z.string(),
    name: z.string(),
    fullName: z.string(),
    private: z.boolean(),
    defaultBranch: z.string(),
    description: z.string().nullable(),
    htmlUrl: z.string(),
  })
  .meta({ id: 'GithubRepo' });

export type GithubRepoDto = z.infer<typeof githubRepoSchema>;

/**
 * Which stored token a GitHub call uses. May be omitted when the workspace has exactly one.
 */
export const githubCredentialQuerySchema = z.object({
  credentialId: z.uuid().optional(),
});

export type GithubCredentialQuery = z.infer<typeof githubCredentialQuerySchema>;

/** GitHub logins: alphanumerics and single hyphens, at most 39 characters. */
export const githubLoginSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, 'Invalid GitHub login');

/** GitHub repository names: letters, digits, `.`, `-` and `_`, at most 100 characters. */
export const githubRepoNameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9._-]{1,100}$/, 'Use letters, digits, ".", "-" or "_" (at most 100)')
  .refine((name) => name !== '.' && name !== '..', 'This name is reserved by GitHub');

export const githubReposQuerySchema = githubCredentialQuerySchema.extend({
  owner: githubLoginSchema,
});

export type GithubReposQuery = z.infer<typeof githubReposQuerySchema>;

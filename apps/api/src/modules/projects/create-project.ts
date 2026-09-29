import { DuplicateRowError, createProject } from '@aievo/db';
import type { Db, Project } from '@aievo/db';
import { GitError } from '@aievo/git';
import type { GitRepo } from '@aievo/git';
import { TemplateNotFoundError, loadTemplateFiles, toPackageName } from '@aievo/presets';
import type { LoadedTemplate, TemplateVariables } from '@aievo/presets';
import type {
  CreateExistingProjectInput,
  CreateNewProjectInput,
  CreateProjectInput,
} from '@aievo/shared';
import { withoutUndefined } from '@aievo/shared';
import type { SecretBox } from '@aievo/shared/crypto';

import { ApiError, toApiError } from '../../errors.js';
import { openGitHubCredential } from '../git-credentials/token.js';

interface Context {
  db: Db;
  secretBox: SecretBox;
}

/** The branch the initial commit of a new repository goes to. */
export const NEW_REPO_BRANCH = 'main';

/** Creates a project linked to a GitHub repository (the two paths of the project wizard). */
export function createProjectWithRepo(
  ctx: Context,
  workspaceId: string,
  input: CreateProjectInput,
): Promise<Project> {
  return input.mode === 'existing'
    ? connectExistingRepo(ctx, workspaceId, input)
    : createRepoFromTemplate(ctx, workspaceId, input);
}

/**
 * Path A: the repository must be visible to the token. Commands come from the wizard
 * as they are; stack detection comes in stage 4.
 */
async function connectExistingRepo(
  ctx: Context,
  workspaceId: string,
  input: CreateExistingProjectInput,
): Promise<Project> {
  const { credential, github } = await openGitHubCredential(ctx, workspaceId, input.credentialId);
  let repo: GitRepo;
  try {
    repo = await github.getRepo(input.owner, input.repo);
  } catch (error) {
    if (error instanceof GitError && error.kind === 'not_found') {
      throw new ApiError(
        404,
        'git_repo_not_found',
        `Repository ${input.owner}/${input.repo} does not exist or the GitHub token cannot access it`,
      );
    }
    throw error;
  }

  try {
    return await createProject(ctx.db, workspaceId, {
      name: input.name ?? repo.name,
      ...withoutUndefined({ description: input.description }),
      repoUrl: repo.htmlUrl,
      defaultBranch: input.defaultBranch,
      repo: { owner: repo.owner, name: repo.name, gitCredentialId: credential.id },
      settings: { commands: input.commands ?? {} },
    });
  } catch (error) {
    if (error instanceof DuplicateRowError) {
      throw new ApiError(
        409,
        'project_repo_taken',
        `Repository ${repo.fullName} is already linked to another project`,
      );
    }
    throw error;
  }
}

/** A template that does not exist is a mistake in the request, reported on its field. */
async function readTemplate(id: string, variables: TemplateVariables): Promise<LoadedTemplate> {
  try {
    return await loadTemplateFiles(id, variables);
  } catch (error) {
    if (error instanceof TemplateNotFoundError) {
      throw new ApiError(400, 'validation_error', 'Request validation failed', [
        { path: ['body', 'template'], code: 'custom', message: 'Unknown template' },
      ]);
    }
    throw error;
  }
}

/**
 * Path B: the platform creates the repository and its single initial commit through the
 * Git Data API, so no clone and no sandbox are needed. Commands, preview and test policy
 * come from the template manifest.
 *
 * Once the repository exists nothing is rolled back: the adapter cannot delete
 * repositories. The error then carries the repository URL instead.
 */
async function createRepoFromTemplate(
  ctx: Context,
  workspaceId: string,
  input: CreateNewProjectInput,
): Promise<Project> {
  // Read before anything is created on GitHub, so a broken template leaves nothing behind.
  const { template, files } = await readTemplate(input.template, {
    projectName: input.name,
    packageName: toPackageName(input.name),
    projectDescription: input.description ?? '',
  });

  const { credential, github } = await openGitHubCredential(ctx, workspaceId, input.credentialId);
  const repo = await github.createRepo({
    owner: input.owner,
    name: input.name,
    private: input.private,
    ...withoutUndefined({ description: input.description }),
  });

  let step: SetupStep = 'initial_commit';
  try {
    await github.createInitialCommit({
      owner: repo.owner,
      repo: repo.name,
      branch: NEW_REPO_BRANCH,
      message: `chore: initial commit from the ${template.manifest.name} template`,
      files,
    });

    step = 'save_project';
    const { commands, preview, testPolicy } = template.manifest;
    return await createProject(ctx.db, workspaceId, {
      name: repo.name,
      ...withoutUndefined({ description: input.description }),
      repoUrl: repo.htmlUrl,
      defaultBranch: NEW_REPO_BRANCH,
      repo: { owner: repo.owner, name: repo.name, gitCredentialId: credential.id },
      settings: { commands, ...(preview === null ? {} : { preview }) },
      testPolicy: {
        ...testPolicy,
        commands: withoutUndefined({ test: commands.test, coverage: commands.coverage }),
      },
    });
  } catch (error) {
    throw setupFailed(repo, step, error);
  }
}

type SetupStep = 'initial_commit' | 'save_project';

const STEP_FAILURES: Record<SetupStep, string> = {
  initial_commit: 'the initial commit with the template files failed',
  save_project: 'the project could not be saved',
};

/**
 * The repository stays on GitHub, so the message says so and links it; the status and
 * the cause's code are those of the underlying failure.
 */
function setupFailed(repo: GitRepo, step: SetupStep, error: unknown): ApiError {
  const cause = toApiError(error);
  return new ApiError(
    cause.status,
    'project_setup_failed',
    `Repository ${repo.fullName} was created, but ${STEP_FAILURES[step]} (${cause.message}). ` +
      'The repository was kept: delete it on GitHub or pick another name before trying again.',
    { repoUrl: repo.htmlUrl, step, cause: cause.code },
  );
}

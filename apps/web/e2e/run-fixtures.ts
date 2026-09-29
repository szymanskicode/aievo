import { randomBytes } from 'node:crypto';

import {
  DEFAULT_WORKSPACE_ID,
  createDb,
  createGitCredential,
  createProject,
  createProvider,
  deleteGitCredential,
  deleteProject,
  deleteProvider,
  updateModel,
  updateWorkspaceSettings,
  upsertDiscoveredModels,
} from '@aievo/db';
import { modelCapabilitiesSchema } from '@aievo/shared';
import { createSecretBox, parseMasterKey } from '@aievo/shared/crypto';

import { E2E_MASTER_KEY_ENV, e2eDatabaseUrl } from './env';

export const RUN_PROJECT = { name: 'E2E playground', owner: 'e2e-owner', repo: 'e2e-playground' };

export interface RunFixtures {
  projectId: string;
  cleanUp: () => Promise<void>;
}

/**
 * What starting the agent needs, stored the way the API stores it: a model for the
 * Programista (its provider has no key; the E2E worker never calls it), a GitHub token and a
 * linked project. `cleanUp` removes all of it, so other specs still see a fresh instance;
 * when seeding fails half-way, what was already stored is removed before the error is thrown.
 */
export async function seedRunFixtures(): Promise<RunFixtures> {
  const { db, close } = createDb(e2eDatabaseUrl());
  const workspaceId = DEFAULT_WORKSPACE_ID;
  const created: { providerId?: string; credentialId?: string; projectId?: string } = {};

  const cleanUp = async () => {
    try {
      await updateWorkspaceSettings(db, workspaceId, { agentModels: { coder: null } });
      // The project goes first: it holds the credential, and its runs and tasks go with it.
      if (created.projectId) await deleteProject(db, workspaceId, created.projectId);
      if (created.credentialId) await deleteGitCredential(db, workspaceId, created.credentialId);
      if (created.providerId) await deleteProvider(db, workspaceId, created.providerId);
    } finally {
      await close();
    }
  };

  try {
    const secretBox = createSecretBox(parseMasterKey(process.env[E2E_MASTER_KEY_ENV]));

    const provider = await createProvider(db, workspaceId, {
      type: 'openai-compatible',
      label: 'E2E fake provider',
      encryptedKey: null,
      keyHint: null,
      baseUrl: 'http://127.0.0.1:9/v1',
    });
    created.providerId = provider.id;
    const [discovered] = await upsertDiscoveredModels(db, workspaceId, provider.id, [
      {
        modelId: 'e2e-fake-model',
        displayName: 'E2E fake model',
        capabilities: modelCapabilitiesSchema.parse({ tools: true }),
        enabled: true,
      },
    ]);
    if (!discovered) throw new Error('The E2E model was not created');
    await updateModel(db, workspaceId, discovered.id, { enabled: true, priceIn: 3, priceOut: 15 });
    await updateWorkspaceSettings(db, workspaceId, { agentModels: { coder: discovered.id } });

    // A random fake that is never sent anywhere: the E2E worker opens a fake GitHub.
    const token = `github_pat_${randomBytes(20).toString('hex')}`;
    const credential = await createGitCredential(db, workspaceId, {
      label: 'E2E GitHub',
      encryptedToken: secretBox.encrypt(token),
      tokenHint: token.slice(-4),
      githubLogin: RUN_PROJECT.owner,
      expiresAt: null,
    });
    created.credentialId = credential.id;
    const project = await createProject(db, workspaceId, {
      name: RUN_PROJECT.name,
      repoUrl: `https://github.com/${RUN_PROJECT.owner}/${RUN_PROJECT.repo}`,
      repo: { owner: RUN_PROJECT.owner, name: RUN_PROJECT.repo, gitCredentialId: credential.id },
      settings: { commands: { install: 'npm ci', test: 'npm test' } },
    });
    created.projectId = project.id;

    return { projectId: project.id, cleanUp };
  } catch (error) {
    await cleanUp();
    throw error;
  }
}

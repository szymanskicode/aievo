import type { Schemas } from '@aievo/api-client';

import { isOpenRun } from './run-status';

export interface RunBlocker {
  message: string;
  /** Where the user fixes it, when the app has a screen for that. */
  link?: { to: '/settings/github' | '/settings/models'; label: string };
}

interface RunBlockerInput {
  setup: Schemas['SetupStatus'];
  settings: Schemas['WorkspaceSettings'];
  project: Schemas['Project'];
  runs: Schemas['Run'][];
}

/**
 * Why the agent cannot be started for a task, in the order the user would fix it; empty
 * when it can. The API checks the same conditions again when the run is started.
 */
export function runBlockers({ setup, settings, project, runs }: RunBlockerInput): RunBlocker[] {
  const blockers: RunBlocker[] = [];
  if (!setup.githubToken) {
    blockers.push({
      message: 'Add a GitHub token first.',
      link: { to: '/settings/github', label: 'Open GitHub settings' },
    });
  }
  if (!settings.agentModels.coder) {
    blockers.push({
      message: 'Choose the model for the Programista agent.',
      link: { to: '/settings/models', label: 'Choose a model' },
    });
  }
  if (!project.repoOwner || !project.repoName || !project.gitCredentialId) {
    blockers.push({ message: 'The project is not linked to a GitHub repository.' });
  } else if (!project.settings.commands.test) {
    blockers.push({ message: 'The project has no test command.' });
  }
  if (runs.some((run) => isOpenRun(run.status))) {
    blockers.push({ message: 'The agent is already working on this task.' });
  }
  return blockers;
}

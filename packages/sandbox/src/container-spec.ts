import { existsSync } from 'node:fs';
import path from 'node:path';

import type { ContainerCreateOptions, MountSettings } from 'dockerode';

import type { CreateSandboxInput } from './sandbox.js';
import { WORKSPACE_DIR } from './sandbox.js';

/** Label on every sandbox container; its value is the run id. */
export const RUN_LABEL = 'aievo.run';

/**
 * The only variables a sandbox starts with (on top of the image's own `PATH` etc.). Nothing
 * of the worker's environment is passed on: no Git token, no model keys, no master key.
 */
export const SANDBOX_ENV: Readonly<Record<string, string>> = {
  HOME: '/home/sandbox',
  CI: 'true',
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
};

export interface ContainerSpecInput extends CreateSandboxInput {
  image: string;
  /** `uid:gid` the container runs as; never root. */
  user: string;
}

export function containerName(runId: string): string {
  return `aievo-run-${runId}`;
}

export function buildContainerOptions(input: ContainerSpecInput): ContainerCreateOptions {
  const gitDir = path.join(input.workspaceDir, '.git');
  const mounts: MountSettings[] = [
    { Type: 'bind', Source: input.workspaceDir, Target: WORKSPACE_DIR, ReadOnly: false },
  ];
  // Read-only, so code from the repository cannot plant hooks or config that git on the host
  // would run when the worker commits.
  if (existsSync(gitDir)) {
    mounts.push({ Type: 'bind', Source: gitDir, Target: `${WORKSPACE_DIR}/.git`, ReadOnly: true });
  }
  const memoryBytes = input.limits.memoryMb * 1024 * 1024;

  return {
    name: containerName(input.runId),
    Image: input.image,
    Cmd: ['sleep', 'infinity'],
    User: input.user,
    WorkingDir: WORKSPACE_DIR,
    Env: Object.entries(SANDBOX_ENV).map(([key, value]) => `${key}=${value}`),
    Labels: { [RUN_LABEL]: input.runId },
    Tty: false,
    OpenStdin: false,
    HostConfig: {
      Mounts: mounts,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      Privileged: false,
      Memory: memoryBytes,
      // Equal to Memory: no swap on top of the limit.
      MemorySwap: memoryBytes,
      NanoCpus: Math.round(input.limits.cpus * 1e9),
      PidsLimit: input.limits.pids,
      // Reaps zombies and forwards signals to the processes the commands leave behind.
      Init: true,
      // Network stays on in stage 2 (package installs); limiting it to registries comes later.
      NetworkMode: 'bridge',
      AutoRemove: false,
    },
  };
}

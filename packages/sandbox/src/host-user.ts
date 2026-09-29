/** UID/GID of the `sandbox` user in the image. */
export const DEFAULT_SANDBOX_USER = '1000:1000';

const USER_PATTERN = /^\d+:\d+$/;

export interface HostIds {
  uid?: number;
  gid?: number;
}

function hostIds(): HostIds {
  // Not available on Windows.
  return {
    ...(process.getuid ? { uid: process.getuid() } : {}),
    ...(process.getgid ? { gid: process.getgid() } : {}),
  };
}

/**
 * `uid:gid` for the sandbox container, so files it writes in the bind-mounted working copy are
 * owned by the host user and git on the host can commit them.
 *
 * - An explicit `override` (`AIEVO_SANDBOX_USER`) wins; it must be `uid:gid` and not root.
 * - On Linux and macOS the host user's IDs are used, unless the worker runs as root.
 * - On Windows there are no UIDs; Docker Desktop lets any container user write the mount, so
 *   the image's own `sandbox` user is used.
 */
export function resolveSandboxUser(override?: string, ids: HostIds = hostIds()): string {
  if (override !== undefined && override !== '') {
    if (!USER_PATTERN.test(override)) {
      throw new Error('AIEVO_SANDBOX_USER must be "uid:gid", e.g. "1000:1000"');
    }
    if (override.split(':')[0] === '0') throw new Error('The sandbox must not run as root');
    return override;
  }
  if (ids.uid === undefined || ids.gid === undefined || ids.uid === 0) return DEFAULT_SANDBOX_USER;
  return `${ids.uid}:${ids.gid}`;
}

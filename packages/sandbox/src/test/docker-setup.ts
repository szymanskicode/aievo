import Docker from 'dockerode';

/** Image the Docker tests run; built by `pnpm sandbox:build`. */
export const TEST_IMAGE = process.env.AIEVO_SANDBOX_IMAGE ?? 'aievo-sandbox-node:1';

/** Fails early with a readable message when Docker or the sandbox image is missing. */
export default async function setup(): Promise<void> {
  const docker = new Docker();
  try {
    await docker.ping();
  } catch (error) {
    throw new Error('Docker is not reachable. Start Docker Desktop (or the Docker daemon).', {
      cause: error,
    });
  }
  try {
    await docker.getImage(TEST_IMAGE).inspect();
  } catch (error) {
    throw new Error(`Image ${TEST_IMAGE} is missing. Build it with \`pnpm sandbox:build\`.`, {
      cause: error,
    });
  }
}

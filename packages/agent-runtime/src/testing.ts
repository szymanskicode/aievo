/**
 * Test doubles for packages that run agents (`@aievo/agent-runtime/testing`): a scripted model
 * and a sandbox on a local directory. Never use them outside tests.
 */
export { FakeLlmClient } from './test/fake-llm-client.js';
export type { FakeResponse, FakeToolCall } from './test/fake-llm-client.js';
export { createTempDirSandbox, TempDirSandbox } from './test/temp-dir-sandbox.js';
export type { ExecHandler } from './test/temp-dir-sandbox.js';

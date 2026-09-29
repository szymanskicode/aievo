import { runAgentLoop } from './loop.js';
import type { AgentRuntime, NativeRuntimeOptions } from './types.js';

/** The default runtime: AIEvo's own loop with its tools (docs/architecture.md section 9). */
export function createNativeRuntime({ llm }: NativeRuntimeOptions): AgentRuntime {
  return { run: (input) => runAgentLoop(llm, input) };
}

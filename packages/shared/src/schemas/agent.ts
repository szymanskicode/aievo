import { z } from 'zod';

import type { ModelCapabilities } from './model.js';

/** Tools an agent can be given (docs/architecture.md section 11); `finish` is always added. */
export const agentToolNames = [
  'list_files',
  'read_file',
  'search_code',
  'write_file',
  'edit_file',
  'run_command',
  'git_diff',
] as const;
export const agentToolNameSchema = z.enum(agentToolNames);
export type AgentToolName = z.infer<typeof agentToolNameSchema>;

/** Capabilities a model can be required to have; the boolean flags of `ModelCapabilities`. */
export const modelCapabilityFlags = [
  'tools',
  'vision',
  'structuredOutput',
  'promptCaching',
  'reasoning',
] as const satisfies readonly (keyof ModelCapabilities)[];
export type ModelCapabilityFlag = (typeof modelCapabilityFlags)[number];

/**
 * Result of the Programista (`coder`) step: what the `finish` tool accepts. The platform
 * puts it into the pull request description next to the data it collects itself.
 */
export const coderResultSchema = z.strictObject({
  summary: z.string().trim().min(1).max(4_000).describe('What changed and why, for the reviewer'),
  changedFiles: z
    .array(z.string().trim().min(1))
    .max(500)
    .describe('Files created or modified, relative to the repository root'),
  tests: z.strictObject({
    commands: z.array(z.string().trim().min(1)).max(20).describe('Commands run last'),
    passed: z.boolean().describe('Whether all of them passed'),
    summary: z.string().trim().min(1).max(1_000).describe('One-line result'),
  }),
  openIssues: z
    .array(z.string().trim().min(1).max(2_000))
    .max(50)
    .describe('Assumptions, unsolved problems, things to check; empty if none'),
});

export type CoderResult = z.infer<typeof coderResultSchema>;

/** Result schemas an agent preset can name in `result`, by versioned id. */
export const agentResultSchemas = {
  'coder-result@1': coderResultSchema,
} as const satisfies Record<string, z.ZodType>;

export type AgentResultId = keyof typeof agentResultSchemas;

const resultIds = Object.keys(agentResultSchemas) as [AgentResultId, ...AgentResultId[]];

/** `agent.yaml` of a preset in `packages/presets/agents/<key>/`. */
export const agentPresetSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(100),
  runtime: z.literal('native'),
  requiredCapabilities: z.array(z.enum(modelCapabilityFlags)).default([]),
  tools: z.array(agentToolNameSchema).min(1),
  permissions: z.strictObject({
    /** Globs the agent may write; `null` for a read-only agent. */
    write: z.array(z.string().min(1)).min(1).nullable(),
    /** `read-only`: test files that exist on the base branch cannot be changed. */
    existingTests: z.enum(['read-only', 'writable']).default('read-only'),
  }),
  limits: z.strictObject({
    maxIterations: z.int().positive().max(500),
  }),
  result: z.enum(resultIds),
  params: z
    .strictObject({
      maxTokens: z.int().positive().optional(),
      temperature: z.number().min(0).max(2).optional(),
    })
    .default({}),
});

export type AgentPreset = z.infer<typeof agentPresetSchema>;
export type AgentPresetInput = z.input<typeof agentPresetSchema>;

/** What `checkAgentModel` needs of a model row. */
export interface AgentModelCandidate {
  enabled: boolean;
  capabilities: ModelCapabilities;
  priceIn: number | null;
  priceOut: number | null;
}

/**
 * Why `model` cannot run an agent that requires `required`, or `null` when it can. A model
 * without pricing is refused: without it the cost limit cannot be enforced.
 */
export function checkAgentModel(
  model: AgentModelCandidate,
  required: readonly ModelCapabilityFlag[],
): string | null {
  if (!model.enabled) return 'The model is disabled';
  const missing = required.filter((flag) => !model.capabilities[flag]);
  if (missing.length > 0) return `The model lacks required capabilities: ${missing.join(', ')}`;
  if (model.priceIn === null || model.priceOut === null) {
    return 'The model has no pricing, so the cost limit cannot be enforced';
  }
  return null;
}

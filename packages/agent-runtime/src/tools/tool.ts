import type { ToolDefinition } from '@aievo/llm';
import type { Sandbox } from '@aievo/sandbox';
import { z } from 'zod';

import type { AgentPermissions, Limits } from '../types.js';

/** What a tool may use; permissions are checked by the tools themselves, not by the prompt. */
export interface ToolContext {
  sandbox: Sandbox;
  permissions: AgentPermissions;
  commands: { allowed: string[] };
  git: { baseRef: string };
  limits: Limits;
  signal: AbortSignal;
}

export interface ToolResult {
  output: string;
  isError?: boolean;
  exitCode?: number | null;
}

export interface Tool<Input extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: Input;
  execute(args: z.infer<Input>, context: ToolContext): Promise<ToolResult>;
}

/** A refused or failed tool call; its message goes back to the model as the result. */
export class ToolError extends Error {
  override name = 'ToolError';
}

export function defineTool<Input extends z.ZodType>(tool: Tool<Input>): Tool {
  return tool as unknown as Tool;
}

export function toToolDefinition(tool: {
  name: string;
  description: string;
  input: z.ZodType;
}): ToolDefinition {
  const schema = z.toJSONSchema(tool.input, { io: 'input' }) as Record<string, unknown>;
  // The `$schema` key is noise to providers.
  delete schema.$schema;
  return { name: tool.name, description: tool.description, inputSchema: schema };
}

/** Readable, one-line-per-issue description of a Zod error, for the model. */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${where}: ${issue.message}`;
  });
}

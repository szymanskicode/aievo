import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { agentPresetSchema } from '@aievo/shared';
import type { AgentPreset } from '@aievo/shared';
import { parse as parseYaml } from 'yaml';

/** `agents/` next to `src/` and `dist/`, so the same code works from both. */
export const AGENTS_DIR = fileURLToPath(new URL('../agents/', import.meta.url));

export const AGENT_FILE = 'agent.yaml';
export const SYSTEM_PROMPT_FILE = 'system-prompt.md';

export interface LoadedAgentPreset {
  preset: AgentPreset;
  systemPrompt: string;
  /**
   * Hash of every file of the preset (`sha256:<12 hex>`), stored with each step so a later
   * edit of the preset does not rewrite history.
   */
  version: string;
}

export interface AgentPresetSource {
  /** Directory holding one sub-directory per agent; defaults to `AGENTS_DIR`. */
  dir?: string;
}

export class AgentPresetNotFoundError extends Error {
  constructor(readonly agentKey: string) {
    super(`Agent preset "${agentKey}" does not exist`);
    this.name = 'AgentPresetNotFoundError';
  }
}

export class InvalidAgentPresetError extends Error {
  constructor(agentKey: string, reason: string) {
    super(`Agent preset "${agentKey}" is invalid: ${reason}`);
    this.name = 'InvalidAgentPresetError';
  }
}

const KEY = /^[a-z][a-z0-9-]*$/;

/** Line endings never change the version: a Windows checkout hashes like a Linux one. */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

async function readPresetFiles(root: string): Promise<Map<string, string>> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
  const files = new Map<string, string>();
  for (const path of paths) files.set(path, normalize(await readFile(join(root, path), 'utf8')));
  return files;
}

function hashFiles(files: Map<string, string>): string {
  const hash = createHash('sha256');
  for (const [path, content] of files) {
    hash.update(`${path}\0${Buffer.byteLength(content)}\0`);
    hash.update(content);
  }
  return `sha256:${hash.digest('hex').slice(0, 12)}`;
}

/** Reads and validates the preset of one agent, e.g. `coder`. */
export async function loadAgentPreset(
  key: string,
  { dir = AGENTS_DIR }: AgentPresetSource = {},
): Promise<LoadedAgentPreset> {
  if (!KEY.test(key)) throw new AgentPresetNotFoundError(key);
  const root = join(dir, key);
  let files: Map<string, string>;
  try {
    files = await readPresetFiles(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new AgentPresetNotFoundError(key);
    throw error;
  }

  const manifest = files.get(AGENT_FILE);
  if (manifest === undefined) throw new AgentPresetNotFoundError(key);
  let data: unknown;
  try {
    data = parseYaml(manifest);
  } catch (error) {
    throw new InvalidAgentPresetError(key, `${AGENT_FILE} is not valid YAML (${String(error)})`);
  }
  const parsed = agentPresetSchema.safeParse(data);
  if (!parsed.success) throw new InvalidAgentPresetError(key, parsed.error.message);
  if (parsed.data.key !== key) {
    throw new InvalidAgentPresetError(key, `its key is "${parsed.data.key}", not "${key}"`);
  }

  const systemPrompt = files.get(SYSTEM_PROMPT_FILE)?.trim() ?? '';
  if (systemPrompt === '') {
    throw new InvalidAgentPresetError(key, `${SYSTEM_PROMPT_FILE} is missing or empty`);
  }
  return { preset: parsed.data, systemPrompt, version: hashFiles(files) };
}

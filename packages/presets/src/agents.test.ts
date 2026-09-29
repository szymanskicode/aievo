import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { agentToolNames } from '@aievo/shared';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AGENTS_DIR,
  AgentPresetNotFoundError,
  InvalidAgentPresetError,
  loadAgentPreset,
} from './agents.js';

const temporaryDirs: string[] = [];

/** An agents directory with the given files, removed after the test. */
async function agentsDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aievo-agents-'));
  temporaryDirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true })));
});

const manifest = `key: demo
name: Demo
role: coder
runtime: native
tools: [read_file]
permissions: { write: null }
limits: { maxIterations: 5 }
result: coder-result@1
`;

describe('the coder preset', () => {
  it('is valid and has a system prompt', async () => {
    const { preset, systemPrompt, version } = await loadAgentPreset('coder');

    expect(preset).toMatchObject({
      key: 'coder',
      name: 'Programista',
      runtime: 'native',
      requiredCapabilities: ['tools'],
      permissions: { write: ['**'], existingTests: 'read-only' },
      limits: { maxIterations: 30 },
      result: 'coder-result@1',
    });
    expect(preset.tools).toEqual([...agentToolNames]);
    expect(systemPrompt).toMatch(/^# Role: Programista/);
    expect(systemPrompt).toContain('`finish`');
    expect(version).toMatch(/^sha256:[0-9a-f]{12}$/);
  });
});

describe('loadAgentPreset', () => {
  it('hashes the files, ignoring line endings', async () => {
    const dir = await agentsDir({ 'demo/agent.yaml': manifest, 'demo/system-prompt.md': 'Hi\n' });
    const first = await loadAgentPreset('demo', { dir });
    expect((await loadAgentPreset('demo', { dir })).version).toBe(first.version);

    await writeFile(join(dir, 'demo/agent.yaml'), manifest.replace(/\n/g, '\r\n'));
    expect((await loadAgentPreset('demo', { dir })).version).toBe(first.version);

    await writeFile(join(dir, 'demo/system-prompt.md'), 'Hello\n');
    expect((await loadAgentPreset('demo', { dir })).version).not.toBe(first.version);
  });

  it('changes the version when the shipped preset changes', async () => {
    const dir = await agentsDir({});
    await cp(join(AGENTS_DIR, 'coder'), join(dir, 'coder'), { recursive: true });
    const original = await loadAgentPreset('coder', { dir });
    await writeFile(join(dir, 'coder', 'notes.md'), 'extra');
    expect((await loadAgentPreset('coder', { dir })).version).not.toBe(original.version);
  });

  it('reports a missing preset', async () => {
    const dir = await agentsDir({ 'other/agent.yaml': manifest });
    await expect(loadAgentPreset('demo', { dir })).rejects.toThrow(AgentPresetNotFoundError);
    await expect(loadAgentPreset('other', { dir })).rejects.toThrow(InvalidAgentPresetError);
    await expect(loadAgentPreset('../demo', { dir })).rejects.toThrow(AgentPresetNotFoundError);
  });

  it.each([
    ['a missing prompt', { 'demo/agent.yaml': manifest }, /system-prompt.md/],
    [
      'an empty prompt',
      { 'demo/agent.yaml': manifest, 'demo/system-prompt.md': '  \n' },
      /system-prompt.md/,
    ],
    [
      'broken YAML',
      { 'demo/agent.yaml': 'key: [', 'demo/system-prompt.md': 'Hi' },
      /not valid YAML/,
    ],
    [
      'an unknown tool',
      {
        'demo/agent.yaml': manifest.replace('[read_file]', '[delete_repo]'),
        'demo/system-prompt.md': 'Hi',
      },
      /invalid/,
    ],
    [
      'a key that differs from the directory',
      {
        'demo/agent.yaml': manifest.replace('key: demo', 'key: other'),
        'demo/system-prompt.md': 'Hi',
      },
      /key is "other"/,
    ],
  ])('refuses %s', async (_name, files, message) => {
    const dir = await agentsDir(files);
    await expect(loadAgentPreset('demo', { dir })).rejects.toThrow(message);
  });
});

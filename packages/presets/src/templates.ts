import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { templateManifestSchema } from '@aievo/shared';
import type { TemplateDto } from '@aievo/shared';
import { parse as parseYaml } from 'yaml';

/** `templates/` next to `src/` and `dist/`, so the same code works from both. */
export const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));

export const MANIFEST_FILE = 'template.yaml';

/** A file to commit, as `@aievo/git` expects it: a `/`-separated path and UTF-8 text. */
export interface TemplateFile {
  path: string;
  content: string;
}

/** Values substituted for `{{name}}` placeholders in text files. */
export interface TemplateVariables {
  /** The repository name, e.g. `aievo-playground`. */
  projectName: string;
  /** `projectName` turned into a valid npm package name. */
  packageName: string;
  projectDescription: string;
}

export interface LoadedTemplate {
  /** The template's validated manifest, read in the same pass as its files. */
  template: TemplateDto;
  files: TemplateFile[];
  /** Binary files, which the text-only initial commit cannot carry. */
  skipped: string[];
}

export class TemplateNotFoundError extends Error {
  constructor(readonly templateId: string) {
    super(`Template "${templateId}" does not exist`);
    this.name = 'TemplateNotFoundError';
  }
}

export class InvalidTemplateError extends Error {
  constructor(templateId: string, reason: string) {
    super(`Template "${templateId}" is invalid: ${reason}`);
    this.name = 'InvalidTemplateError';
  }
}

export interface TemplateSource {
  /** Directory holding one sub-directory per template; defaults to `TEMPLATES_DIR`. */
  dir?: string;
}

async function readManifest(dir: string, id: string): Promise<TemplateDto> {
  const text = await readFile(join(dir, id, MANIFEST_FILE), 'utf8');
  const result = templateManifestSchema.safeParse(parseYaml(text));
  if (!result.success) throw new InvalidTemplateError(id, result.error.message);
  return { id, manifest: result.data };
}

/** Every template with its validated manifest, sorted by id. */
export async function listTemplates({ dir = TEMPLATES_DIR }: TemplateSource = {}): Promise<
  TemplateDto[]
> {
  const entries = await readdir(dir, { withFileTypes: true });
  const ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(ids.map((id) => readManifest(dir, id)));
}

/** One template by id; `TemplateNotFoundError` when there is no such template. */
export async function getTemplate(id: string, source: TemplateSource = {}): Promise<TemplateDto> {
  const template = (await listTemplates(source)).find((candidate) => candidate.id === id);
  if (!template) throw new TemplateNotFoundError(id);
  return template;
}

/** Lowercase, only characters npm allows, no leading `.` or `_`. */
export function toPackageName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+/, '');
  return cleaned === '' ? 'app' : cleaned;
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** Replaces known `{{name}}` placeholders; unknown ones stay as they are. */
export function substitute(text: string, variables: TemplateVariables): string {
  return text.replace(PLACEHOLDER, (match, name: string) =>
    Object.hasOwn(variables, name) ? variables[name as keyof TemplateVariables] : match,
  );
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** Text is what decodes as UTF-8 and contains no NUL byte; anything else is binary. */
export function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return utf8.decode(bytes);
  } catch {
    return null;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

/**
 * A template ready for the initial commit: its manifest, and its files with the manifest
 * left out, placeholders substituted and binary files skipped.
 */
export async function loadTemplateFiles(
  id: string,
  variables: TemplateVariables,
  source: TemplateSource = {},
): Promise<LoadedTemplate> {
  const { dir = TEMPLATES_DIR } = source;
  const template = await getTemplate(id, source);

  const root = join(dir, id);
  const files: TemplateFile[] = [];
  const skipped: string[] = [];
  for (const path of await listFiles(root)) {
    if (path === MANIFEST_FILE) continue;
    const text = decodeText(await readFile(join(root, path)));
    if (text === null) skipped.push(path);
    else files.push({ path, content: substitute(text, variables) });
  }
  return { template, files, skipped };
}

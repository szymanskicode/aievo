import path from 'node:path';

import { z } from 'zod';

import { resolveToolPath, resolveWritablePath } from './paths.js';
import { ToolError, defineTool } from './tool.js';

/** Most paths `list_files` returns. */
export const LIST_FILES_LIMIT = 500;
/** Largest file `read_file` and `edit_file` open. */
export const READ_FILE_MAX_BYTES = 1024 * 1024;
/** Most lines one `read_file` returns. */
export const READ_FILE_MAX_LINES = 2000;

export const listFilesTool = defineTool({
  name: 'list_files',
  description:
    'List files under a directory of the repository (recursively, honouring .gitignore, without .git). ' +
    'Optionally filter with a glob relative to that directory, e.g. "**/*.test.ts".',
  input: z.object({
    path: z.string().default('.').describe('Directory relative to /workspace'),
    glob: z.string().min(1).optional().describe('Glob relative to `path`'),
  }),
  async execute({ path: dir, glob }, context) {
    const target = await resolveToolPath(context, dir);
    const files = await context.sandbox.listFiles(target.absolute);
    const matching = glob
      ? files.filter((file) =>
          path.posix.matchesGlob(
            target.relative === '.' ? file : path.posix.relative(target.relative, file),
            glob,
          ),
        )
      : files;
    if (matching.length === 0) return { output: 'No files found.' };
    const shown = matching.slice(0, LIST_FILES_LIMIT);
    const note =
      matching.length > shown.length
        ? `\n[${matching.length - shown.length} more files not shown; narrow the path or glob]`
        : '';
    return { output: shown.join('\n') + note };
  },
});

export const readFileTool = defineTool({
  name: 'read_file',
  description:
    `Read a text file, optionally a range of lines. Lines are numbered ("12| text"). ` +
    `At most ${READ_FILE_MAX_LINES} lines per call; use startLine/endLine for longer files.`,
  input: z.object({
    path: z.string().min(1).describe('File relative to /workspace'),
    startLine: z.number().int().min(1).optional().describe('First line, 1-based'),
    endLine: z.number().int().min(1).optional().describe('Last line, inclusive'),
  }),
  async execute({ path: file, startLine, endLine }, context) {
    const target = await resolveToolPath(context, file);
    const content = await context.sandbox.readFile(target.absolute, {
      maxBytes: READ_FILE_MAX_BYTES,
    });
    if (content === '') return { output: '[empty file]' };
    const lines = content.split('\n');
    if (lines.at(-1) === '') lines.pop();

    const first = startLine ?? 1;
    if (first > lines.length) {
      throw new ToolError(
        `The file has ${lines.length} lines; startLine ${first} is past its end.`,
      );
    }
    const requestedLast = Math.min(endLine ?? lines.length, lines.length);
    if (requestedLast < first) throw new ToolError('endLine must not be before startLine.');
    const last = Math.min(requestedLast, first + READ_FILE_MAX_LINES - 1);

    const body = lines
      .slice(first - 1, last)
      .map((line, index) => `${first + index}| ${line}`)
      .join('\n');
    const note =
      last < requestedLast || (endLine === undefined && last < lines.length)
        ? `\n[lines ${first}-${last} of ${lines.length}; read on with startLine ${last + 1}]`
        : '';
    return { output: body + note };
  },
});

export const writeFileTool = defineTool({
  name: 'write_file',
  description:
    'Create or overwrite a whole file with `content`. Missing directories are created. ' +
    'Prefer edit_file for changes to existing files.',
  input: z.object({
    path: z.string().min(1).describe('File relative to /workspace'),
    content: z.string(),
  }),
  async execute({ path: file, content }, context) {
    const target = await resolveWritablePath(context, file);
    await context.sandbox.writeFile(target.absolute, content);
    return { output: `Wrote ${target.relative} (${content.length} characters).` };
  },
});

function countOccurrences(text: string, search: string): number {
  let count = 0;
  for (
    let index = text.indexOf(search);
    index !== -1;
    index = text.indexOf(search, index + search.length)
  ) {
    count += 1;
  }
  return count;
}

export const editFileTool = defineTool({
  name: 'edit_file',
  description:
    'Replace one exact fragment of a file: `find` must occur exactly once (include enough ' +
    'surrounding lines to make it unique); it is replaced by `replace`. Whitespace matters.',
  input: z.object({
    path: z.string().min(1).describe('File relative to /workspace'),
    find: z.string().min(1),
    replace: z.string(),
  }),
  async execute({ path: file, find, replace }, context) {
    const target = await resolveWritablePath(context, file);
    const content = await context.sandbox.readFile(target.absolute, {
      maxBytes: READ_FILE_MAX_BYTES,
    });
    const count = countOccurrences(content, find);
    if (count === 0) {
      throw new ToolError(
        `The text to find does not occur in ${target.relative}. Read the file and copy the fragment exactly.`,
      );
    }
    if (count > 1) {
      throw new ToolError(
        `The text to find occurs ${count} times in ${target.relative}; include more surrounding lines so it is unique.`,
      );
    }
    const index = content.indexOf(find);
    await context.sandbox.writeFile(
      target.absolute,
      content.slice(0, index) + replace + content.slice(index + find.length),
    );
    return { output: `Edited ${target.relative}.` };
  },
});

import type { ToolName } from '../types.js';
import { gitDiffTool, runCommandTool, searchCodeTool } from './command-tools.js';
import { editFileTool, listFilesTool, readFileTool, writeFileTool } from './file-tools.js';
import type { Tool } from './tool.js';

export const TOOLS: Readonly<Record<ToolName, Tool>> = {
  list_files: listFilesTool,
  read_file: readFileTool,
  search_code: searchCodeTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  run_command: runCommandTool,
  git_diff: gitDiffTool,
};

export const FINISH_TOOL = 'finish';

export const FINISH_DESCRIPTION =
  'End the step with its result. Call it exactly once, when the work is done, with input ' +
  'matching the schema. An invalid result is returned with the problems; fix them and call again.';

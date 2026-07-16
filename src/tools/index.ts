import { editFileTool } from "./edit-file.ts";
import { gitTool } from "./git.ts";
import { readFileTool } from "./read-file.ts";
import { runCommandTool } from "./run-command.ts";
import { searchCodeTool } from "./search-code.ts";
import { symbolsTool } from "./symbols.ts";
import type { ToolDefinition } from "./types.ts";

/** The six core tools, in the order they're advertised to the model. */
export const ALL_TOOLS: ToolDefinition[] = [
  readFileTool,
  editFileTool,
  searchCodeTool,
  symbolsTool,
  runCommandTool,
  gitTool,
];

export { readFileTool, editFileTool, searchCodeTool, symbolsTool, runCommandTool, gitTool };
export type { ToolDefinition, ToolContext } from "./types.ts";

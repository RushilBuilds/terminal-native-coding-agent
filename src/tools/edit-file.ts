import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { resolveInside } from "./paths.ts";
import { defineTool } from "./types.ts";

export const editFileTool = defineTool({
  name: "edit_file",
  description:
    "Create a file or replace an exact string in an existing one. To create/overwrite, pass an " +
    "empty old_string with the full contents as new_string. To edit, old_string must match exactly once.",
  inputShape: {
    path: z.string().describe("File path relative to the working directory."),
    old_string: z
      .string()
      .optional()
      .describe("Exact text to replace. Empty or omitted creates/overwrites the file."),
    new_string: z.string().describe("Replacement text, or the full contents when creating."),
  },
  async execute(args, ctx) {
    let full: string;
    try {
      full = resolveInside(ctx.cwd, args.path);
    } catch (e) {
      return `ERROR: ${(e as Error).message}`;
    }

    const oldStr = args.old_string ?? "";
    if (oldStr === "") {
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, args.new_string, "utf8");
      return `Wrote ${args.path} (${args.new_string.length} bytes).`;
    }

    let content: string;
    try {
      content = await readFile(full, "utf8");
    } catch (e) {
      return `ERROR: cannot read ${args.path}: ${(e as Error).message}`;
    }
    const occurrences = content.split(oldStr).length - 1;
    if (occurrences === 0) return `ERROR: old_string not found in ${args.path}.`;
    if (occurrences > 1) {
      return `ERROR: old_string matches ${occurrences} times in ${args.path}; add context to make it unique.`;
    }
    await writeFile(full, content.replace(oldStr, args.new_string), "utf8");
    return `Edited ${args.path} (1 replacement).`;
  },
});

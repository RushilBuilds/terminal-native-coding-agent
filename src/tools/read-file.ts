import { readFile } from "node:fs/promises";
import { z } from "zod";
import { resolveInside } from "./paths.ts";
import { truncate } from "./truncate.ts";
import { defineTool } from "./types.ts";

export const readFileTool = defineTool({
  name: "read_file",
  description:
    "Read a UTF-8 text file relative to the working directory. Optionally slice by line range. Output is line-numbered and truncated if large.",
  inputShape: {
    path: z.string().describe("File path relative to the working directory."),
    offset: z.number().int().min(1).optional().describe("1-based first line to read."),
    limit: z.number().int().min(1).optional().describe("Maximum number of lines to read."),
  },
  async execute(args, ctx) {
    let full: string;
    try {
      full = resolveInside(ctx.cwd, args.path);
    } catch (e) {
      return `ERROR: ${(e as Error).message}`;
    }
    let content: string;
    try {
      content = await readFile(full, "utf8");
    } catch (e) {
      return `ERROR: cannot read ${args.path}: ${(e as Error).message}`;
    }
    const all = content.split("\n");
    const start = args.offset ? args.offset - 1 : 0;
    const end = args.limit ? start + args.limit : all.length;
    const slice = all.slice(start, end);
    const numbered = slice
      .map((line, i) => `${String(start + i + 1).padStart(5)}  ${line}`)
      .join("\n");
    const { text } = truncate(numbered);
    return text || "(empty file)";
  },
});

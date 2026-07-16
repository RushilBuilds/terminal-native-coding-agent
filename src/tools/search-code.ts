import { relative, resolve } from "node:path";
import { z } from "zod";
import { exec } from "./exec.ts";
import { resolveInside } from "./paths.ts";
import { truncate } from "./truncate.ts";
import { defineTool } from "./types.ts";

export const searchCodeTool = defineTool({
  name: "search_code",
  description:
    "Search file contents with ripgrep (regex). Returns file:line:match, capped to a bounded " +
    "number of results. Prefer this over run_command for searching.",
  inputShape: {
    pattern: z.string().describe("Regex pattern in ripgrep syntax."),
    path: z.string().optional().describe("Directory or file to search (default: whole project)."),
    glob: z.string().optional().describe("Restrict to files matching this glob, e.g. '*.ts'."),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe("Maximum matching lines to return (default 200)."),
  },
  async execute(args, ctx) {
    let searchArg = ".";
    if (args.path) {
      try {
        searchArg = relative(resolve(ctx.cwd), resolveInside(ctx.cwd, args.path)) || ".";
      } catch (e) {
        return `ERROR: ${(e as Error).message}`;
      }
    }
    const max = args.max_results ?? 200;
    const rgArgs = ["--line-number", "--no-heading", "--color", "never", "--max-count", "50"];
    if (args.glob) rgArgs.push("--glob", args.glob);
    rgArgs.push("-e", args.pattern, searchArg);

    const r = await exec("rg", rgArgs, { cwd: ctx.cwd, timeoutMs: 15_000 });
    if (r.code === null) return `ERROR: ripgrep (rg) not available: ${r.stderr}`;
    const lines = r.stdout.split("\n").filter(Boolean);
    if (lines.length === 0) return "No matches.";

    const shown = lines.slice(0, max);
    const note = lines.length > max ? `\n… ${lines.length - max} more matching lines omitted.` : "";
    const { text } = truncate(shown.join("\n"));
    return `${text}${note}`;
  },
});

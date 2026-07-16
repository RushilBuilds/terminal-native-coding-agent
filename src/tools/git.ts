import { z } from "zod";
import { exec } from "./exec.ts";
import { truncate } from "./truncate.ts";
import { defineTool } from "./types.ts";

/** Read + safe-write subcommands. Destructive/remote ops (push, reset --hard) are excluded. */
const ALLOWED = new Set([
  "status",
  "diff",
  "log",
  "show",
  "add",
  "commit",
  "branch",
  "checkout",
  "switch",
  "stash",
  "restore",
  "rev-parse",
]);

export const gitTool = defineTool({
  name: "git",
  description: `Run a git subcommand in the working directory. Allowed subcommands: ${[...ALLOWED].join(", ")}. Pass arguments as an array, e.g. ['status','--short'] or ['commit','-m','message'].`,
  inputShape: {
    args: z
      .array(z.string())
      .min(1)
      .describe("git arguments; the first must be an allowed subcommand."),
  },
  async execute(args, ctx) {
    const sub = args.args[0];
    if (!sub || !ALLOWED.has(sub)) {
      return `ERROR: git '${sub ?? ""}' is not allowed. Allowed: ${[...ALLOWED].join(", ")}.`;
    }
    const r = await exec("git", args.args, { cwd: ctx.cwd, timeoutMs: 20_000 });
    const body = [r.stdout, r.stderr].filter(Boolean).join("\n");
    const { text } = truncate(body);
    return `${text || "(no output)"}\n[exit ${r.code}]`;
  },
});

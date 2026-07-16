import { z } from "zod";
import { exec } from "./exec.ts";
import { truncate } from "./truncate.ts";
import { defineTool } from "./types.ts";

export const runCommandTool = defineTool({
  name: "run_command",
  description:
    "Run a shell command (bash -c) in the working directory and return its combined stdout/stderr " +
    "and exit code. Output is truncated; the command is killed after the timeout.",
  inputShape: {
    command: z.string().describe("Shell command to execute."),
    timeout_ms: z
      .number()
      .int()
      .min(100)
      .max(600_000)
      .optional()
      .describe("Wall-clock timeout in milliseconds (default 30000)."),
  },
  async execute(args, ctx) {
    const r = await exec("bash", ["-c", args.command], {
      cwd: ctx.cwd,
      timeoutMs: args.timeout_ms ?? 30_000,
    });
    const body = [r.stdout, r.stderr].filter(Boolean).join("\n");
    const { text } = truncate(body);
    const status = r.timedOut ? "timed out" : `exit ${r.code}`;
    return `${text || "(no output)"}\n[${status}]`;
  },
});

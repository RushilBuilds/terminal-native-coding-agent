import type { Hook } from "../engine.ts";

/** Clearly destructive shell patterns, with a human reason for the denial. */
const PATTERNS: Array<[RegExp, string]> = [
  [/\brm\s+-\w*r\w*f\w*\s+(\/|~|\$HOME|\*|\.)(\s|$)/, "recursive force-remove of a broad path"],
  [/\brm\s+-\w*f\w*r\w*\s+(\/|~|\$HOME)/, "recursive force-remove of a broad path"],
  [/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, "fork bomb"],
  [/\bmkfs\.[a-z0-9]+\b/, "filesystem format"],
  [/\bdd\b[^\n]*\bof=\/dev\//, "raw write to a block device"],
  [/>\s*\/dev\/(sd|nvme|disk|hd)/, "raw write to a block device"],
  [/\bsudo\b/, "privilege escalation"],
  [/\b(shutdown|reboot|halt|poweroff)\b/, "host power/state change"],
  [/\bchmod\s+-R\s+0*777\s+\//, "world-writable filesystem root"],
];

/** Extract the shell string a call would run, if any. */
function shellOf(tool: string, args: Record<string, unknown>): string | undefined {
  if (tool === "run_command" && typeof args.command === "string") return args.command;
  return undefined;
}

/** PreToolUse: deny obviously destructive shell commands before they run. */
export const dangerousCommands: Hook = {
  name: "dangerous-commands",
  preToolUse(call) {
    const shell = shellOf(call.tool, call.args);
    if (!shell) return;
    for (const [pattern, reason] of PATTERNS) {
      if (pattern.test(shell)) return { action: "deny", reason };
    }
  },
};

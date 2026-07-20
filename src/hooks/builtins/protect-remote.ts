import type { Hook } from "../engine.ts";

/**
 * PreToolUse: keep the agent from pushing to a remote on its own. The `git` tool already
 * excludes `push`, but a shell `git push` (or a force-push) via run_command would slip past —
 * this closes that gap. The Day-9 PR flow uses `gh` deliberately, outside the agent loop.
 */
export const protectRemote: Hook = {
  name: "protect-remote",
  preToolUse(call) {
    if (call.tool === "git" && Array.isArray(call.args.args)) {
      if (call.args.args.includes("push")) {
        return { action: "deny", reason: "pushing to a remote is disabled by policy" };
      }
    }
    if (call.tool === "run_command" && typeof call.args.command === "string") {
      if (/\bgit\b[^\n]*\bpush\b/.test(call.args.command)) {
        return { action: "deny", reason: "pushing to a remote is disabled by policy" };
      }
    }
  },
};

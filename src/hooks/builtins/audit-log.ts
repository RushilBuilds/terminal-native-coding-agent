import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Hook } from "../engine.ts";

/**
 * Append-only audit trail. Records every tool call and session boundary to a log file — a
 * paper trail of what the agent did, independent of the (ephemeral) TUI activity pane.
 * Factory so tests can point it at a temp path.
 */
export function auditLog(logPath = ".agent/audit.log"): Hook {
  const write = (line: string) => {
    try {
      mkdirSync(dirname(logPath), { recursive: true });
      appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
    } catch {
      // Never let logging break a turn.
    }
  };
  return {
    name: "audit-log",
    sessionStart(info) {
      write(`session-start task=${JSON.stringify(info.task ?? "")}`);
    },
    sessionEnd() {
      write("session-end");
    },
    postToolUse({ tool, result }) {
      write(`tool=${tool} result_chars=${result.length}`);
    },
  };
}

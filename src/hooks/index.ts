import { auditLog } from "./builtins/audit-log.ts";
import { dangerousCommands } from "./builtins/dangerous-commands.ts";
import { protectRemote } from "./builtins/protect-remote.ts";
import { protectSensitiveFiles } from "./builtins/protect-sensitive-files.ts";
import { redactSecrets } from "./builtins/redact-secrets.ts";
import { type Hook, HookEngine } from "./engine.ts";

/**
 * Default policy set, applied in order. Edit this array to add or remove policies — deny
 * hooks run first-wins, result transforms chain. This is the project's "hooks config".
 */
export const DEFAULT_HOOKS: Hook[] = [
  dangerousCommands,
  protectRemote,
  protectSensitiveFiles,
  redactSecrets,
  auditLog(),
];

/** Build the default hook engine. */
export function defaultHookEngine(): HookEngine {
  return new HookEngine(DEFAULT_HOOKS);
}

export { HookEngine } from "./engine.ts";
export type { Hook, PreDecision, ToolCall, ToolOutcome, SessionInfo } from "./engine.ts";
export { auditLog, dangerousCommands, protectRemote, protectSensitiveFiles, redactSecrets };

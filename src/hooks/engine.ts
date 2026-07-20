/**
 * Hook engine — the safety + policy layer that wraps every tool call.
 *
 * Hooks fire on four lifecycle events (PreToolUse / PostToolUse / SessionStart / SessionEnd).
 * PreToolUse can allow, rewrite arguments, or *deny* a call (first deny wins). PostToolUse
 * transforms the result (e.g. redacting secrets), chaining through every hook. Keeping this
 * separate from the loop means safety rules are authored and tested in isolation.
 */

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolOutcome {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

export interface SessionInfo {
  task?: string;
}

/** A PreToolUse hook allows (optionally rewriting args) or denies with a reason. */
export type PreDecision =
  | { action: "allow"; args?: Record<string, unknown> }
  | { action: "deny"; reason: string };

export interface Hook {
  name: string;
  preToolUse?(call: ToolCall): PreDecision | void | Promise<PreDecision | void>;
  /** Return a transformed result string, or void to leave it unchanged. */
  postToolUse?(outcome: ToolOutcome): string | void | Promise<string | void>;
  /** Return a message to surface in the UI, or void. */
  sessionStart?(info: SessionInfo): string | void | Promise<string | void>;
  sessionEnd?(info: SessionInfo): string | void | Promise<string | void>;
}

export interface PreToolUseOutcome {
  /** Set when a hook denied the call. */
  blocked?: { hook: string; reason: string };
  /** Possibly-rewritten arguments to use if not blocked. */
  args: Record<string, unknown>;
}

export class HookEngine {
  constructor(private readonly hooks: Hook[]) {}

  /** Run PreToolUse hooks in order; the first deny short-circuits. */
  async preToolUse(tool: string, args: Record<string, unknown>): Promise<PreToolUseOutcome> {
    let current = args;
    for (const hook of this.hooks) {
      const decision = await hook.preToolUse?.({ tool, args: current });
      if (!decision) continue;
      if (decision.action === "deny") {
        return { blocked: { hook: hook.name, reason: decision.reason }, args: current };
      }
      if (decision.args) current = decision.args;
    }
    return { args: current };
  }

  /** Run PostToolUse hooks in order, chaining any result transforms. */
  async postToolUse(tool: string, args: Record<string, unknown>, result: string): Promise<string> {
    let current = result;
    for (const hook of this.hooks) {
      const out = await hook.postToolUse?.({ tool, args, result: current });
      if (typeof out === "string") current = out;
    }
    return current;
  }

  async sessionStart(info: SessionInfo): Promise<string[]> {
    return this.collect((h) => h.sessionStart?.(info));
  }

  async sessionEnd(info: SessionInfo): Promise<string[]> {
    return this.collect((h) => h.sessionEnd?.(info));
  }

  private async collect(
    run: (hook: Hook) => string | void | Promise<string | void>,
  ): Promise<string[]> {
    const messages: string[] = [];
    for (const hook of this.hooks) {
      const msg = await run(hook);
      if (typeof msg === "string" && msg) messages.push(msg);
    }
    return messages;
  }
}

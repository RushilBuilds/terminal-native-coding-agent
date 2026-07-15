/**
 * Agent loop — Day 2 stub.
 *
 * The real plan → act → observe → recover loop (with live model calls and MCP tools)
 * lands from Day 4. For now this drives the TUI with a believable turn so the panes,
 * input, and cancellation can be built and demoed against a stable interface.
 */

export type ActivityKind = "user" | "system" | "tool" | "error";

export interface ActivityEntry {
  id: number;
  kind: ActivityKind;
  text: string;
}

export type TodoStatus = "pending" | "active" | "done";

export interface TodoItem {
  id: number;
  text: string;
  status: TodoStatus;
}

export interface Budget {
  turns: number;
  tokens: number;
  usd: number;
}

export const INITIAL_BUDGET: Budget = { turns: 0, tokens: 0, usd: 0 };

/** Callbacks the TUI supplies so the loop can stream updates into the panes. */
export interface LoopHandlers {
  onActivity: (kind: ActivityKind, text: string) => void;
}

/** Raised when a turn is cancelled via the abort signal. */
export class CancelledError extends Error {
  override name = "CancelledError";
}

/**
 * Run one stubbed turn. Emits a few activity lines with small delays so the TUI shows a
 * live "running" state that Ctrl-C can actually cancel. Resolves when the turn completes.
 */
export async function runStubTurn(
  prompt: string,
  handlers: LoopHandlers,
  signal?: AbortSignal,
): Promise<void> {
  handlers.onActivity("user", prompt);
  await delay(250, signal);
  handlers.onActivity("system", "planning the task…");
  await delay(400, signal);
  handlers.onActivity(
    "system",
    "live model + MCP tool loop arrive on Day 4 — echoing your prompt for now.",
  );
}

/** Promise-based delay that rejects with CancelledError if the signal aborts. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CancelledError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

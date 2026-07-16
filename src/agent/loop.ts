/**
 * Agent loop — Day 3 stub.
 *
 * The real plan → act → observe → recover loop (with live model calls and MCP tools)
 * lands from Day 4. For now this drives the TUI with a believable turn — including a
 * plan it rewrites as it "works" — so the panes, journaling, and cancellation can be
 * built and demoed against a stable interface.
 */
import { type Plan, createPlan, withStatus } from "./plan.ts";

export type { Plan, TodoItem, TodoStatus } from "./plan.ts";

export type ActivityKind = "user" | "system" | "tool" | "error";

export interface ActivityEntry {
  id: number;
  kind: ActivityKind;
  text: string;
}

export interface Budget {
  turns: number;
  tokens: number;
  usd: number;
}

export const INITIAL_BUDGET: Budget = { turns: 0, tokens: 0, usd: 0 };

/** Callbacks the TUI supplies so the loop can stream updates into the panes + journal. */
export interface LoopHandlers {
  onActivity: (kind: ActivityKind, text: string) => void;
  onPlan: (plan: Plan) => void;
}

/** Raised when a turn is cancelled via the abort signal. */
export class CancelledError extends Error {
  override name = "CancelledError";
}

/** The steps the stub "plans" for any task (a real plan comes from the model on Day 4). */
const STUB_STEPS = [
  "Understand the request",
  "Search the codebase",
  "Make the change",
  "Verify the result",
];

/**
 * Run one stubbed turn: draft a plan, then walk it step by step (pending → active → done),
 * emitting a fresh plan on every transition so the TUI + journal can track progress. Delays
 * keep the "running" state alive long enough for Ctrl-C to cancel it. Resolves when done.
 */
export async function runStubTurn(
  prompt: string,
  handlers: LoopHandlers,
  signal?: AbortSignal,
): Promise<void> {
  handlers.onActivity("user", prompt);

  let plan: Plan = createPlan(STUB_STEPS);
  handlers.onPlan(plan);
  await delay(150, signal);
  handlers.onActivity("system", "planning the task…");

  for (const item of plan) {
    plan = withStatus(plan, item.id, "active");
    handlers.onPlan(plan);
    await delay(140, signal);
    plan = withStatus(plan, item.id, "done");
    handlers.onPlan(plan);
  }

  handlers.onActivity(
    "system",
    "live model + MCP tool loop arrive on Day 4 — this plan was stubbed for now.",
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

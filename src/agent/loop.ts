/**
 * Agent loop.
 *
 * `runAgentTurn` is the real plan → act → observe → recover loop: it drives a model through
 * tool calls (over MCP) until the task is done or a safety cap trips, updating the plan and
 * streaming activity as it goes. `runStubTurn` is the offline stand-in used when there's no
 * API key configured, so the TUI still works and demos.
 */
import { z } from "zod";
import type { HookEngine } from "../hooks/engine.ts";
import type { ChatMessage, ModelClient, ToolSpec } from "../model/types.ts";
import { truncate } from "../tools/truncate.ts";
import { type Plan, PlanSchema, createPlan, withStatus } from "./plan.ts";

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
    "offline stub — set OPENROUTER_API_KEY to run the real model + tool loop.",
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

// ─── Real agent loop ──────────────────────────────────────────────────────────

/** A function that runs one turn against the panes — either the real loop or the stub. */
export type TurnRunner = (
  prompt: string,
  handlers: LoopHandlers,
  signal?: AbortSignal,
) => Promise<void>;

/** A tool the loop can dispatch (name + JSON-Schema params), plus how to call it. */
export interface AgentTools {
  specs: ToolSpec[];
  call: (name: string, args: Record<string, unknown>) => Promise<string>;
}

export interface AgentDeps {
  model: ModelClient;
  tools: AgentTools;
  handlers: LoopHandlers;
  /** Safety + policy hooks that wrap every tool call. */
  hooks?: HookEngine;
  /** Safety cap on tool-calling rounds (full turn/token/$ ceilings arrive Day 8). */
  maxRounds?: number;
}

const SYSTEM_PROMPT = `You are a terminal-native coding agent working inside the user's repository.
Work in small steps using the provided tools:
- Call update_plan whenever your plan changes, so the user can see your intent.
- Explore with search_code and symbols before reading whole files.
- Make edits with edit_file and verify with run_command.
When the task is finished, reply with a brief summary and stop calling tools.`;

/** The one tool the loop handles locally: the model's view of its own TodoWrite plan. */
const UPDATE_PLAN_SPEC: ToolSpec = {
  name: "update_plan",
  description: "Replace your current plan. Provide the full list of steps each time you call it.",
  parameters: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        description: "Ordered plan steps.",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            status: { type: "string", enum: ["pending", "active", "done"] },
          },
          required: ["text"],
        },
      },
    },
    required: ["steps"],
  },
};

const UpdatePlanArgs = z.object({
  steps: z.array(
    z.object({ text: z.string().min(1), status: PlanSchema.element.shape.status.optional() }),
  ),
});

/**
 * Run one real turn: plan → act → observe → recover, driving the model through tool calls
 * until it stops calling tools (done) or the safety cap trips. Streams activity + plan
 * updates to the handlers and returns when the turn settles.
 */
export async function runAgentTurn(
  prompt: string,
  deps: AgentDeps,
  signal?: AbortSignal,
): Promise<void> {
  const { model, tools, handlers, hooks } = deps;
  const maxRounds = deps.maxRounds ?? 12;
  handlers.onActivity("user", prompt);

  const toolSpecs = [UPDATE_PLAN_SPEC, ...tools.specs];
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];

  for (const msg of await (hooks?.sessionStart({ task: prompt }) ?? [])) {
    handlers.onActivity("system", msg);
  }

  try {
    for (let round = 0; round < maxRounds; round++) {
      if (signal?.aborted) throw new CancelledError();

      const { message } = await model.chat({ messages, tools: toolSpecs, signal });
      if (message.content.trim()) handlers.onActivity("system", message.content.trim());

      // Record the assistant turn (with any tool calls) for the next round's context.
      messages.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      // No tool calls → the model considers the task done.
      if (message.toolCalls.length === 0) return;

      for (const call of message.toolCalls) {
        if (signal?.aborted) throw new CancelledError();
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: await dispatch(call.name, call.arguments, deps),
        });
      }
    }

    handlers.onActivity(
      "error",
      `stopped after ${maxRounds} tool rounds (safety cap — full ceilings arrive Day 8).`,
    );
  } finally {
    for (const msg of await (hooks?.sessionEnd({ task: prompt }) ?? [])) {
      handlers.onActivity("system", msg);
    }
  }
}

/** Run one tool call: update_plan locally, everything else through hooks → tool → hooks. */
async function dispatch(
  name: string,
  args: Record<string, unknown>,
  deps: AgentDeps,
): Promise<string> {
  const { tools, handlers, hooks } = deps;
  if (name === "update_plan") return applyUpdatePlan(args, handlers);

  // PreToolUse: a hook may deny the call or rewrite its arguments.
  const pre = hooks ? await hooks.preToolUse(name, args) : { args };
  if ("blocked" in pre && pre.blocked) {
    const msg = `BLOCKED by ${pre.blocked.hook}: ${pre.blocked.reason}`;
    handlers.onActivity("error", msg);
    return msg;
  }

  handlers.onActivity("tool", `${name} ${summarizeArgs(pre.args)}`);
  let result: string;
  try {
    result = truncate(await tools.call(name, pre.args)).text;
  } catch (e) {
    result = `ERROR: ${(e as Error).message}`;
  }
  // PostToolUse: transform the observation (e.g. redact secrets) before it re-enters context.
  return hooks ? await hooks.postToolUse(name, pre.args, result) : result;
}

/** Apply an update_plan tool call to the plan pane; returns the tool result string. */
function applyUpdatePlan(args: Record<string, unknown>, handlers: LoopHandlers): string {
  const parsed = UpdatePlanArgs.safeParse(args);
  if (!parsed.success) return "ERROR: invalid plan (need { steps: [{ text, status? }] }).";
  const plan: Plan = parsed.data.steps.map((s, i) => ({
    id: i + 1,
    text: s.text,
    status: s.status ?? "pending",
  }));
  handlers.onPlan(plan);
  return `plan updated (${plan.length} steps)`;
}

/** A compact one-line preview of tool arguments for the activity pane. */
function summarizeArgs(args: Record<string, unknown>): string {
  const preview = Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  return preview.length > 80 ? `${preview.slice(0, 77)}…` : preview;
}

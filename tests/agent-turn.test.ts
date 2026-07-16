import { describe, expect, test } from "bun:test";
import { type ActivityKind, type AgentDeps, type Plan, runAgentTurn } from "../src/agent/loop.ts";
import type { AssistantTurn, ChatRequest, ModelClient } from "../src/model/types.ts";

/** A scripted model: returns each queued turn in order, recording the requests it saw. */
class FakeModel implements ModelClient {
  readonly requests: ChatRequest[] = [];
  constructor(private readonly turns: AssistantTurn[]) {}
  async chat(req: ChatRequest): Promise<{ message: AssistantTurn }> {
    // Snapshot messages — the loop mutates the same array across rounds.
    this.requests.push({ ...req, messages: req.messages.map((m) => ({ ...m })) });
    const message = this.turns.shift() ?? { content: "done", toolCalls: [] };
    return { message };
  }
}

function harness(model: ModelClient, call: AgentDeps["tools"]["call"]) {
  const activity: Array<{ kind: ActivityKind; text: string }> = [];
  const plans: Plan[] = [];
  const deps: AgentDeps = {
    model,
    tools: {
      specs: [{ name: "read_file", description: "read", parameters: { type: "object" } }],
      call,
    },
    handlers: {
      onActivity: (kind, text) => activity.push({ kind, text }),
      onPlan: (plan) => plans.push(plan),
    },
  };
  return { activity, plans, deps };
}

describe("runAgentTurn", () => {
  test("dispatches a tool call, feeds the result back, then finishes", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const model = new FakeModel([
      {
        content: "reading the file",
        toolCalls: [{ id: "c1", name: "read_file", arguments: { path: "a.ts" } }],
      },
      { content: "The file defines foo().", toolCalls: [] },
    ]);
    const { activity, deps } = harness(model, async (name, args) => {
      calls.push({ name, args });
      return "contents of a.ts";
    });

    await runAgentTurn("what does a.ts do?", deps);

    expect(calls).toEqual([{ name: "read_file", args: { path: "a.ts" } }]);
    // Tool result was fed back to the model on the second round.
    const secondReq = model.requests[1];
    expect(secondReq?.messages.at(-1)).toEqual({
      role: "tool",
      tool_call_id: "c1",
      content: "contents of a.ts",
    });
    // Final answer surfaced to the UI, tool call logged.
    expect(activity.some((a) => a.text.includes("The file defines foo"))).toBe(true);
    expect(activity.some((a) => a.kind === "tool" && a.text.includes("read_file"))).toBe(true);
  });

  test("update_plan is handled locally and drives the plan pane", async () => {
    const model = new FakeModel([
      {
        content: "",
        toolCalls: [
          {
            id: "p1",
            name: "update_plan",
            arguments: { steps: [{ text: "look", status: "active" }, { text: "fix" }] },
          },
        ],
      },
      { content: "done", toolCalls: [] },
    ]);
    let toolCalled = false;
    const { plans, deps } = harness(model, async () => {
      toolCalled = true;
      return "";
    });

    await runAgentTurn("go", deps);

    expect(toolCalled).toBe(false); // update_plan never hits the tool dispatcher
    const last = plans.at(-1);
    expect(last?.map((t) => t.text)).toEqual(["look", "fix"]);
    expect(last?.[0]?.status).toBe("active");
    expect(last?.[1]?.status).toBe("pending"); // defaulted
  });

  test("stops at the safety cap when the model never stops calling tools", async () => {
    // A model that always calls a tool.
    const model: ModelClient = {
      async chat() {
        return {
          message: { content: "", toolCalls: [{ id: "x", name: "read_file", arguments: {} }] },
        };
      },
    };
    const { activity, deps } = harness(model, async () => "ok");
    deps.maxRounds = 3;

    await runAgentTurn("loop forever", deps);
    expect(activity.some((a) => a.kind === "error" && a.text.includes("safety cap"))).toBe(true);
  });
});

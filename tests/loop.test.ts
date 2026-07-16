import { describe, expect, test } from "bun:test";
import { type ActivityKind, CancelledError, type Plan, runStubTurn } from "../src/agent/loop.ts";

function collector() {
  const events: Array<{ kind: ActivityKind; text: string }> = [];
  const plans: Plan[] = [];
  return {
    events,
    plans,
    handlers: {
      onActivity: (kind: ActivityKind, text: string) => events.push({ kind, text }),
      onPlan: (plan: Plan) => plans.push(plan),
    },
  };
}

describe("runStubTurn", () => {
  test("emits the user prompt then system lines, in order", async () => {
    const { events, handlers } = collector();
    await runStubTurn("do the thing", handlers);
    expect(events[0]).toEqual({ kind: "user", text: "do the thing" });
    expect(events.map((e) => e.kind)).toEqual(["user", "system", "system"]);
  });

  test("rewrites the plan until every step is done", async () => {
    const { plans, handlers } = collector();
    await runStubTurn("build a feature", handlers);
    const first = plans[0];
    const last = plans[plans.length - 1];
    expect(first?.every((t) => t.status === "pending")).toBe(true);
    expect(last?.every((t) => t.status === "done")).toBe(true);
    expect(last?.length).toBeGreaterThan(0);
  });

  test("rejects with CancelledError when the signal aborts mid-turn", async () => {
    const { events, handlers } = collector();
    const controller = new AbortController();
    const promise = runStubTurn("cancel me", handlers, controller.signal);
    controller.abort(); // abort during the first delay
    await expect(promise).rejects.toBeInstanceOf(CancelledError);
    // The user line was emitted synchronously before the first await; no further activity.
    expect(events).toEqual([{ kind: "user", text: "cancel me" }]);
  });
});

import { describe, expect, test } from "bun:test";
import { type ActivityKind, CancelledError, runStubTurn } from "../src/agent/loop.ts";

function collector() {
  const events: Array<{ kind: ActivityKind; text: string }> = [];
  return {
    events,
    handlers: { onActivity: (kind: ActivityKind, text: string) => events.push({ kind, text }) },
  };
}

describe("runStubTurn", () => {
  test("emits the user prompt then system lines, in order", async () => {
    const { events, handlers } = collector();
    await runStubTurn("do the thing", handlers);
    expect(events[0]).toEqual({ kind: "user", text: "do the thing" });
    expect(events.map((e) => e.kind)).toEqual(["user", "system", "system"]);
  });

  test("rejects with CancelledError when the signal aborts mid-turn", async () => {
    const { events, handlers } = collector();
    const controller = new AbortController();
    const promise = runStubTurn("cancel me", handlers, controller.signal);
    controller.abort(); // abort during the first delay
    await expect(promise).rejects.toBeInstanceOf(CancelledError);
    // The user line was emitted synchronously before the first await; no further lines.
    expect(events).toEqual([{ kind: "user", text: "cancel me" }]);
  });
});

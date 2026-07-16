import { describe, expect, test } from "bun:test";
import { PlanSchema, createPlan, parsePlan, planProgress, withStatus } from "../src/agent/plan.ts";

describe("plan", () => {
  test("createPlan assigns sequential ids and pending status", () => {
    const plan = createPlan(["a", "b", "c"]);
    expect(plan.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(plan.every((t) => t.status === "pending")).toBe(true);
  });

  test("withStatus is immutable and only touches the target item", () => {
    const plan = createPlan(["a", "b"]);
    const next = withStatus(plan, 1, "done");
    expect(next[0]?.status).toBe("done");
    expect(next[1]?.status).toBe("pending");
    expect(plan[0]?.status).toBe("pending"); // original untouched
  });

  test("planProgress counts completed steps", () => {
    let plan = createPlan(["a", "b", "c", "d"]);
    plan = withStatus(plan, 1, "done");
    plan = withStatus(plan, 2, "done");
    expect(planProgress(plan)).toEqual({ done: 2, total: 4 });
  });

  test("parsePlan rejects malformed data", () => {
    expect(() => parsePlan([{ id: "x", text: "", status: "nope" }])).toThrow();
    expect(PlanSchema.safeParse([{ id: 1, text: "ok", status: "active" }]).success).toBe(true);
  });
});

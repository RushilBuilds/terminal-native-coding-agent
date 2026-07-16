import { z } from "zod";

/**
 * Typed plan state — the TodoWrite-style list the model rewrites each turn.
 *
 * The plan is the agent's working memory of what it's doing. Keeping it a small, validated
 * value (rather than free text) is what lets us render it live, journal it, and resume it
 * after a crash. From Day 4 the model produces these; today the stub loop does.
 */

export const TODO_STATUSES = ["pending", "active", "done"] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];
export const TodoStatusSchema = z.enum(TODO_STATUSES);

export const TodoItemSchema = z.object({
  id: z.number().int().nonnegative(),
  text: z.string().min(1),
  status: TodoStatusSchema,
});
export type TodoItem = z.infer<typeof TodoItemSchema>;

export const PlanSchema = z.array(TodoItemSchema);
export type Plan = z.infer<typeof PlanSchema>;

/** Build a fresh plan from step descriptions; ids are 1..n, all pending. */
export function createPlan(steps: string[]): Plan {
  return steps.map((text, i) => ({ id: i + 1, text, status: "pending" }));
}

/** Return a new plan with one item's status changed (immutable). */
export function withStatus(plan: Plan, id: number, status: TodoStatus): Plan {
  return plan.map((t) => (t.id === id ? { ...t, status } : t));
}

/** Parse/validate an untrusted plan value (e.g. loaded from disk or a model). */
export function parsePlan(data: unknown): Plan {
  return PlanSchema.parse(data);
}

/** Completed vs total, for progress display. */
export function planProgress(plan: Plan): { done: number; total: number } {
  return { done: plan.filter((t) => t.status === "done").length, total: plan.length };
}

/**
 * Model registry.
 *
 * The lesson targets 2026-era SKUs (Claude Sonnet 4.7, GPT-5.4-Codex, Gemini 3 Pro).
 * Those slugs may not exist on OpenRouter yet, so we keep the code decoupled from any
 * specific SKU: pick a *role* (default / reasoning / fast) and the registry maps it to a
 * concrete OpenRouter slug. Override the slug directly with TNCA_MODEL_ID at any time.
 */

export type ModelRole = "default" | "reasoning" | "fast";

export interface ModelSpec {
  /** OpenRouter model slug, e.g. "anthropic/claude-sonnet-4.5". */
  id: string;
  /** Human label for the TUI/logs. */
  label: string;
  /** USD per 1M input tokens (used for cost accounting; approximate). */
  inputPer1M: number;
  /** USD per 1M output tokens. */
  outputPer1M: number;
  /** Context window in tokens (informational). */
  contextWindow: number;
}

/**
 * Role → concrete model. Update these slugs/prices as OpenRouter's catalog changes.
 * Prices are best-effort defaults; the token accounting layer (Day 7) reads them.
 */
export const MODEL_REGISTRY: Record<ModelRole, ModelSpec> = {
  default: {
    id: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    inputPer1M: 3,
    outputPer1M: 15,
    contextWindow: 200_000,
  },
  reasoning: {
    id: "openai/gpt-5-codex",
    label: "GPT-5 Codex",
    inputPer1M: 5,
    outputPer1M: 15,
    contextWindow: 400_000,
  },
  fast: {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    inputPer1M: 0.3,
    outputPer1M: 2.5,
    contextWindow: 1_000_000,
  },
};

/**
 * Resolve a model spec from a role and an optional raw-slug override.
 * If `overrideId` is provided, it wins and we synthesize a spec (unknown pricing → 0).
 */
export function resolveModel(role: ModelRole, overrideId?: string): ModelSpec {
  if (overrideId) {
    const known = Object.values(MODEL_REGISTRY).find((m) => m.id === overrideId);
    if (known) return known;
    return {
      id: overrideId,
      label: overrideId,
      inputPer1M: 0,
      outputPer1M: 0,
      contextWindow: 0,
    };
  }
  return MODEL_REGISTRY[role];
}

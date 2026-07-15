import { z } from "zod";
import { type ModelRole, type ModelSpec, resolveModel } from "./models.ts";

/**
 * Environment schema. Bun auto-loads `.env`, so `process.env` is already populated by
 * the time this runs. We validate up front and fail fast with a readable message.
 */
const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required (see .env.example)"),
  OPENROUTER_APP_URL: z.string().url().optional(),
  OPENROUTER_APP_NAME: z.string().optional(),

  TNCA_MODEL: z.enum(["default", "reasoning", "fast"]).default("default"),
  TNCA_MODEL_ID: z.string().optional(),

  TNCA_MAX_TURNS: z.coerce.number().int().positive().default(50),
  TNCA_MAX_TOKENS: z.coerce.number().int().positive().default(200_000),
  TNCA_MAX_USD: z.coerce.number().positive().default(5),
});

export interface AppConfig {
  openRouter: {
    apiKey: string;
    appUrl?: string;
    appName?: string;
    baseUrl: string;
  };
  model: ModelSpec;
  modelRole: ModelRole;
  ceilings: {
    maxTurns: number;
    maxTokens: number;
    maxUsd: number;
  };
}

let cached: AppConfig | undefined;

/**
 * Load + validate config once, then cache it. Throws a friendly error if the env is
 * missing/invalid so the CLI can print it without a stack trace.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`Invalid configuration:\n${issues.join("\n")}`);
  }
  const e = parsed.data;

  cached = {
    openRouter: {
      apiKey: e.OPENROUTER_API_KEY,
      appUrl: e.OPENROUTER_APP_URL,
      appName: e.OPENROUTER_APP_NAME,
      baseUrl: "https://openrouter.ai/api/v1",
    },
    model: resolveModel(e.TNCA_MODEL, e.TNCA_MODEL_ID),
    modelRole: e.TNCA_MODEL,
    ceilings: {
      maxTurns: e.TNCA_MAX_TURNS,
      maxTokens: e.TNCA_MAX_TOKENS,
      maxUsd: e.TNCA_MAX_USD,
    },
  };
  return cached;
}

/** Thrown for user-facing config problems (missing keys, bad values). */
export class ConfigError extends Error {
  override name = "ConfigError";
}

export { resolveModel };
export type { ModelRole, ModelSpec };

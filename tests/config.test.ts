import { describe, expect, test } from "bun:test";
import { ConfigError, loadConfig } from "../src/config/index.ts";
import { MODEL_REGISTRY, resolveModel } from "../src/config/models.ts";

describe("resolveModel", () => {
  test("maps roles to registry specs", () => {
    expect(resolveModel("default")).toEqual(MODEL_REGISTRY.default);
    expect(resolveModel("fast")).toEqual(MODEL_REGISTRY.fast);
  });

  test("returns a known spec when the override matches a registry slug", () => {
    const spec = resolveModel("fast", MODEL_REGISTRY.default.id);
    expect(spec).toEqual(MODEL_REGISTRY.default);
  });

  test("synthesizes a spec for an unknown override slug", () => {
    const spec = resolveModel("default", "some/unlisted-model");
    expect(spec.id).toBe("some/unlisted-model");
    expect(spec.inputPer1M).toBe(0);
    expect(spec.outputPer1M).toBe(0);
  });
});

describe("loadConfig", () => {
  test("throws a ConfigError when the API key is missing", () => {
    // Pass an explicit env so the caller's real environment is never read.
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  test("parses a minimal valid env and applies ceiling defaults", () => {
    const config = loadConfig({ OPENROUTER_API_KEY: "sk-or-test" } as NodeJS.ProcessEnv);
    expect(config.openRouter.apiKey).toBe("sk-or-test");
    expect(config.model).toEqual(MODEL_REGISTRY.default);
    expect(config.ceilings).toEqual({ maxTurns: 50, maxTokens: 200_000, maxUsd: 5 });
  });
});

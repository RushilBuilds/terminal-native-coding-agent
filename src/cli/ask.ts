#!/usr/bin/env bun
/**
 * `ask` — the smallest possible slice of the agent: one streamed round-trip to the model.
 *
 * Usage:
 *   bun run ask "explain the plan/act/observe/recover loop in one paragraph"
 *
 * This exists to prove the OpenRouter client + config are wired correctly before we build
 * the TUI (Day 2) and the tool loop (Day 4). It is intentionally dependency-free.
 */
import { ConfigError, loadConfig } from "../config/index.ts";
import { ModelError, OpenRouterClient } from "../model/openrouter.ts";

async function main(): Promise<number> {
  const prompt = process.argv.slice(2).join(" ").trim();
  if (!prompt) {
    process.stderr.write('Usage: bun run ask "your prompt here"\n');
    return 2;
  }

  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n\nCopy .env.example to .env and fill it in.\n`);
      return 1;
    }
    throw err;
  }

  const client = new OpenRouterClient(config);

  // Cancel cleanly on Ctrl-C.
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.on("SIGINT", onSigint);

  process.stderr.write(`\x1b[2m● ${config.model.label} (${config.model.id})\x1b[0m\n\n`);

  try {
    const { usage } = await client.complete(
      {
        messages: [
          { role: "system", content: "You are a concise, helpful coding assistant." },
          { role: "user", content: prompt },
        ],
        signal: controller.signal,
      },
      (text) => process.stdout.write(text),
    );

    process.stdout.write("\n");
    if (usage) {
      const cost =
        (usage.promptTokens / 1e6) * config.model.inputPer1M +
        (usage.completionTokens / 1e6) * config.model.outputPer1M;
      process.stderr.write(
        `\n\x1b[2m${usage.totalTokens} tokens ` +
          `(${usage.promptTokens} in / ${usage.completionTokens} out) · ~$${cost.toFixed(4)}\x1b[0m\n`,
      );
    }
    return 0;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      process.stderr.write("\n\x1b[2m(cancelled)\x1b[0m\n");
      return 130;
    }
    if (err instanceof ModelError) {
      process.stderr.write(`\nModel error: ${err.message}\n${err.detail ?? ""}\n`);
      return 1;
    }
    throw err;
  } finally {
    process.off("SIGINT", onSigint);
  }
}

process.exit(await main());

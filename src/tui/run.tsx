import { render } from "ink";
import { loadConfig } from "../config/index.ts";
import { App } from "./App.tsx";
import type { Ceilings } from "./panes/BudgetPane.tsx";

const DEFAULT_CEILINGS: Ceilings = { maxTurns: 50, maxTokens: 200_000, maxUsd: 5 };

/**
 * Launch the interactive TUI. Reads config for the model label + ceilings but degrades
 * gracefully when it's missing (Day 2 renders without a live model). Requires a TTY.
 */
export async function startTui(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("The TUI needs an interactive terminal. Try: bun run start\n");
    return;
  }

  let modelLabel = "unconfigured";
  let ceilings = DEFAULT_CEILINGS;
  try {
    const config = loadConfig();
    modelLabel = config.model.label;
    ceilings = config.ceilings;
  } catch {
    // No API key yet — fine for the Day 2 scaffold. The header shows "unconfigured".
  }

  const { waitUntilExit } = render(<App modelLabel={modelLabel} ceilings={ceilings} />, {
    exitOnCtrlC: false,
  });
  await waitUntilExit();
}

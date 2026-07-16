import { render } from "ink";
import { SessionJournal } from "../agent/journal.ts";
import { loadConfig } from "../config/index.ts";
import { App } from "./App.tsx";
import type { Ceilings } from "./panes/BudgetPane.tsx";

const DEFAULT_CEILINGS: Ceilings = { maxTurns: 50, maxTokens: 200_000, maxUsd: 5 };

/**
 * Launch the interactive TUI. Reads config for the model label + ceilings but degrades
 * gracefully when it's missing (renders without a live model). Restores the plan from a
 * session a previous run left mid-flight (crash recovery). Requires a TTY.
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
    // No API key yet — fine for the scaffold. The header shows "unconfigured".
  }

  const journal = new SessionJournal();
  const initialSession = journal.latestResumable();

  const { waitUntilExit } = render(
    <App
      modelLabel={modelLabel}
      ceilings={ceilings}
      journal={journal}
      initialSession={initialSession}
    />,
    { exitOnCtrlC: false },
  );
  await waitUntilExit();
}

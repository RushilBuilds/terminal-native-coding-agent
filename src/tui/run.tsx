import { render } from "ink";
import { SessionJournal } from "../agent/journal.ts";
import { type TurnRunner, runAgentTurn, runStubTurn } from "../agent/loop.ts";
import { type AppConfig, loadConfig } from "../config/index.ts";
import { McpToolClient } from "../mcp/client.ts";
import { type RunningMcpServer, startMcpHttpServer } from "../mcp/server.ts";
import { OpenRouterClient } from "../model/openrouter.ts";
import { App } from "./App.tsx";
import type { Ceilings } from "./panes/BudgetPane.tsx";

const DEFAULT_CEILINGS: Ceilings = { maxTurns: 50, maxTokens: 200_000, maxUsd: 5 };

/**
 * Launch the interactive TUI. When an API key is configured it stands up the MCP tool server,
 * connects a client, and drives the real agent loop; otherwise it falls back to the offline
 * stub so the UI still works. Restores a crashed session's plan on launch. Requires a TTY.
 */
export async function startTui(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("The TUI needs an interactive terminal. Try: bun run start\n");
    return;
  }

  let config: AppConfig | undefined;
  try {
    config = loadConfig();
  } catch {
    // No API key yet — run the offline stub. Header shows "unconfigured".
  }

  const journal = new SessionJournal();
  const initialSession = journal.latestResumable();

  const { runTurn, modelLabel, dispose } = await buildRunner(config);

  const { waitUntilExit } = render(
    <App
      modelLabel={modelLabel}
      ceilings={config?.ceilings ?? DEFAULT_CEILINGS}
      journal={journal}
      runTurn={runTurn}
      initialSession={initialSession}
    />,
    { exitOnCtrlC: false },
  );
  await waitUntilExit();
  await dispose();
}

interface Runner {
  runTurn: TurnRunner;
  modelLabel: string;
  dispose: () => Promise<void>;
}

/** Build the real MCP-backed runner when configured, else the offline stub runner. */
async function buildRunner(config: AppConfig | undefined): Promise<Runner> {
  if (!config) {
    return { runTurn: runStubTurn, modelLabel: "unconfigured (stub)", dispose: async () => {} };
  }

  let server: RunningMcpServer | undefined;
  let client: McpToolClient | undefined;
  try {
    server = await startMcpHttpServer({ cwd: process.cwd() });
    client = new McpToolClient(server.url);
    await client.connect();
    const remote = await client.listTools();
    const specs = remote.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    }));
    const model = new OpenRouterClient(config);
    const connectedClient = client;

    const runTurn: TurnRunner = (prompt, handlers, signal) =>
      runAgentTurn(
        prompt,
        { model, tools: { specs, call: (n, a) => connectedClient.call(n, a) }, handlers },
        signal,
      );

    return {
      runTurn,
      modelLabel: config.model.label,
      dispose: async () => {
        await client?.close();
        await server?.close();
      },
    };
  } catch (err) {
    // If the tool server fails to come up, degrade to the stub rather than crash the TUI.
    await client?.close();
    await server?.close();
    const message = err instanceof Error ? err.message : String(err);
    const runTurn: TurnRunner = async (_prompt, handlers) => {
      handlers.onActivity("error", `tool server unavailable: ${message}`);
    };
    return { runTurn, modelLabel: "tools unavailable", dispose: async () => {} };
  }
}

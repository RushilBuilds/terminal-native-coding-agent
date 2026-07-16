import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ActivityKind, type Plan, runAgentTurn } from "../src/agent/loop.ts";
import { McpToolClient } from "../src/mcp/client.ts";
import { type RunningMcpServer, startMcpHttpServer } from "../src/mcp/server.ts";
import type { AssistantTurn, ChatRequest, ModelClient } from "../src/model/types.ts";

/** Scripted model that walks a fixed sequence of turns. */
class FakeModel implements ModelClient {
  constructor(private readonly turns: AssistantTurn[]) {}
  async chat(_req: ChatRequest): Promise<{ message: AssistantTurn }> {
    return { message: this.turns.shift() ?? { content: "done", toolCalls: [] } };
  }
}

let dir: string;
let server: RunningMcpServer;
let client: McpToolClient;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "tnca-e2e-"));
  server = await startMcpHttpServer({ cwd: dir });
  client = new McpToolClient(server.url);
  await client.connect();
});
afterEach(async () => {
  await client.close();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("full Day-4 stack (model → MCP → tool → observe)", () => {
  test("the loop edits a file through the real tool server", async () => {
    writeFileSync(join(dir, "greeting.txt"), "hello");

    const model = new FakeModel([
      {
        content: "I'll update the greeting.",
        toolCalls: [
          {
            id: "e1",
            name: "edit_file",
            arguments: { path: "greeting.txt", old_string: "hello", new_string: "goodbye" },
          },
        ],
      },
      { content: "Done — changed hello to goodbye.", toolCalls: [] },
    ]);

    const remote = await client.listTools();
    const specs = remote.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    }));

    const activity: Array<{ kind: ActivityKind; text: string }> = [];
    const plans: Plan[] = [];
    await runAgentTurn("change the greeting to goodbye", {
      model,
      tools: { specs, call: (n, a) => client.call(n, a) },
      handlers: {
        onActivity: (kind, text) => activity.push({ kind, text }),
        onPlan: (plan) => plans.push(plan),
      },
    });

    // The edit actually happened on disk, dispatched over MCP StreamableHTTP.
    expect(await readFile(join(dir, "greeting.txt"), "utf8")).toBe("goodbye");
    expect(activity.some((a) => a.kind === "tool" && a.text.includes("edit_file"))).toBe(true);
    expect(activity.some((a) => a.text.includes("Done"))).toBe(true);
  });
});

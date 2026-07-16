import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpToolClient } from "../src/mcp/client.ts";
import { type RunningMcpServer, startMcpHttpServer } from "../src/mcp/server.ts";

let dir: string;
let server: RunningMcpServer;
let client: McpToolClient;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "tnca-mcp-"));
  server = await startMcpHttpServer({ cwd: dir });
  client = new McpToolClient(server.url);
  await client.connect();
});
afterEach(async () => {
  await client.close();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("MCP StreamableHTTP round-trip", () => {
  test("advertises the six core tools", async () => {
    const tools = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["edit_file", "git", "read_file", "run_command", "search_code", "symbols"].sort(),
    );
    // Each tool ships a JSON-Schema for its inputs.
    const readTool = tools.find((t) => t.name === "read_file");
    expect(readTool?.inputSchema.type).toBe("object");
  });

  test("dispatches a tool call over the wire and returns its output", async () => {
    writeFileSync(join(dir, "hello.txt"), "line one\nline two");
    const out = await client.call("read_file", { path: "hello.txt" });
    expect(out).toContain("line one");
    expect(out).toContain("1  line one");
  });

  test("round-trips an edit through the server", async () => {
    const msg = await client.call("edit_file", { path: "made.txt", new_string: "created via mcp" });
    expect(msg).toContain("Wrote");
    const read = await client.call("read_file", { path: "made.txt" });
    expect(read).toContain("created via mcp");
  });
});

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** A tool as advertised by the server: JSON-Schema input, ready to hand to a model. */
export interface RemoteTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Thin MCP client over StreamableHTTP. The agent loop uses it to discover the tools and
 * dispatch the model's tool calls — the same protocol a real editor would speak to a tool server.
 */
export class McpToolClient {
  private client: Client | undefined;

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    const client = new Client({ name: "tnca-agent", version: "0.3.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(this.url)));
    this.client = client;
  }

  async listTools(): Promise<RemoteTool[]> {
    const { tools } = await this.require().listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? { type: "object" }) as Record<string, unknown>,
    }));
  }

  /** Call a tool and return its text output (content parts joined). */
  async call(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.require().callTool({ name, arguments: args });
    const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
    return content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
  }

  private require(): Client {
    if (!this.client) throw new Error("McpToolClient not connected — call connect() first");
    return this.client;
  }
}

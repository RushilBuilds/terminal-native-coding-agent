import { type Server as HttpServer, type IncomingMessage, createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ALL_TOOLS, type ToolContext } from "../tools/index.ts";

/** Build an McpServer exposing the six core tools bound to `ctx`. */
export function buildMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "tnca-tools", version: "0.3.0" });
  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputShape },
      async (args: unknown) => {
        const text = await tool.execute(args, ctx);
        return { content: [{ type: "text" as const, text }] };
      },
    );
  }
  return server;
}

export interface RunningMcpServer {
  url: string;
  close: () => Promise<void>;
}

/**
 * Serve the tools over MCP StreamableHTTP on localhost. Uses the SDK's stateless pattern —
 * a fresh server + transport per request — which is simple and robust for a single local
 * client. Pass port 0 to get an ephemeral port (handy for tests).
 */
export function startMcpHttpServer(ctx: ToolContext, port = 0): Promise<RunningMcpServer> {
  const http: HttpServer = createServer(async (req, res) => {
    try {
      const server = buildMcpServer(ctx);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, await readBody(req));
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    }
  });

  return new Promise((resolve) => {
    http.listen(port, "127.0.0.1", () => {
      const addr = http.address();
      const boundPort = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        url: `http://127.0.0.1:${boundPort}/mcp`,
        close: () => new Promise<void>((r) => http.close(() => r())),
      });
    });
  });
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== "POST") return undefined;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : undefined;
}

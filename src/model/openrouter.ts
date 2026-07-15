import type { AppConfig } from "../config/index.ts";
import type { ChatOptions, StreamEvent, Usage } from "./types.ts";

/**
 * Minimal OpenRouter client built on native fetch + SSE parsing — no SDK.
 *
 * OpenRouter exposes an OpenAI-compatible `/chat/completions` endpoint. We only implement
 * what the agent loop needs: a streaming chat call that yields text deltas and final usage.
 * Tool-calling, JSON mode, etc. get layered on in later days.
 */
export class OpenRouterClient {
  constructor(private readonly config: AppConfig) {}

  /**
   * Stream a chat completion as an async iterable of {@link StreamEvent}s.
   * Yields `delta` events as text arrives, a `usage` event when the provider reports
   * token counts, and a final `done` event.
   */
  async *stream(opts: ChatOptions): AsyncGenerator<StreamEvent, void, unknown> {
    const { openRouter, model } = this.config;
    const body = {
      model: opts.model ?? model.id,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens,
      stream: true,
      // Ask OpenRouter to include usage in the final SSE chunk.
      usage: { include: true },
    };

    const res = await fetch(`${openRouter.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!res.ok || !res.body) {
      const detail = await safeText(res);
      throw new ModelError(`OpenRouter request failed (${res.status} ${res.statusText})`, {
        status: res.status,
        detail,
      });
    }

    yield* parseSse(res.body, opts.signal);
  }

  /**
   * Convenience wrapper: consume the stream, invoke `onDelta` per chunk, and return the
   * assembled text plus usage. Used by the `ask` CLI.
   */
  async complete(
    opts: ChatOptions,
    onDelta?: (text: string) => void,
  ): Promise<{ text: string; usage?: Usage }> {
    let text = "";
    let usage: Usage | undefined;
    for await (const ev of this.stream(opts)) {
      if (ev.type === "delta") {
        text += ev.text;
        onDelta?.(ev.text);
      } else if (ev.type === "usage") {
        usage = ev.usage;
      }
    }
    return { text, usage };
  }

  private headers(): Record<string, string> {
    const { openRouter } = this.config;
    const h: Record<string, string> = {
      Authorization: `Bearer ${openRouter.apiKey}`,
      "Content-Type": "application/json",
    };
    // Optional attribution headers surfaced on the OpenRouter dashboard.
    if (openRouter.appUrl) h["HTTP-Referer"] = openRouter.appUrl;
    if (openRouter.appName) h["X-Title"] = openRouter.appName;
    return h;
  }
}

/** Parse an OpenAI-style SSE body into {@link StreamEvent}s. */
async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        for (const line of frame.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            yield { type: "done" };
            return;
          }
          const evt = parseChunk(data);
          if (evt) yield evt;
        }

        sep = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
  yield { type: "done" };
}

/** Turn one SSE JSON payload into a StreamEvent, if it carries content or usage. */
function parseChunk(data: string): StreamEvent | undefined {
  let json: OpenRouterChunk;
  try {
    json = JSON.parse(data) as OpenRouterChunk;
  } catch {
    return undefined; // ignore keep-alive comments / malformed frames
  }

  const delta = json.choices?.[0]?.delta?.content;
  if (delta) return { type: "delta", text: delta };

  if (json.usage) {
    return {
      type: "usage",
      usage: {
        promptTokens: json.usage.prompt_tokens ?? 0,
        completionTokens: json.usage.completion_tokens ?? 0,
        totalTokens: json.usage.total_tokens ?? 0,
      },
    };
  }
  return undefined;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

interface OpenRouterChunk {
  choices?: Array<{ delta?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/** Thrown when the provider returns a non-2xx response. */
export class ModelError extends Error {
  override name = "ModelError";
  readonly status?: number;
  readonly detail?: string;
  constructor(message: string, opts?: { status?: number; detail?: string }) {
    super(message);
    this.status = opts?.status;
    this.detail = opts?.detail;
  }
}

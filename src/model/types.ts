/** OpenAI/OpenRouter-compatible chat message shapes (kept minimal for Day 1). */

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
}

/** Token usage returned by the provider at the end of a stream. */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Options for a single chat completion request. */
export interface ChatOptions {
  messages: ChatMessage[];
  /** OpenRouter model slug; defaults to the configured model when omitted. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Abort the request/stream early. */
  signal?: AbortSignal;
}

/** A single streamed chunk from the model. */
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done" };

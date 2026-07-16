/** OpenAI/OpenRouter-compatible chat message + tool-calling shapes. */

export type Role = "system" | "user" | "assistant" | "tool";

/** One tool call as emitted by the model (OpenAI function-calling wire shape). */
export interface RawToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: Role;
  content: string;
  /** Present on assistant messages that requested tool calls. */
  tool_calls?: RawToolCall[];
  /** Present on tool-result messages; ties the result to its call. */
  tool_call_id?: string;
}

/** A tool advertised to the model: name, description, JSON-Schema parameters. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A decoded tool call the agent loop can dispatch. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AssistantTurn {
  content: string;
  toolCalls: ToolCall[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
}

/** Minimal contract the agent loop depends on — easy to fake in tests. */
export interface ModelClient {
  chat(req: ChatRequest): Promise<{ message: AssistantTurn; usage?: Usage }>;
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

// The app's own shapes for talking to a language model, independent of
// any provider. Each provider translates these to and from its own API.

// A JSON schema object describing a tool's parameters
export interface ToolParameters {
  type: "object";
  properties: Record<string, { type: string; description: string }>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
}

export interface ToolCall {
  // Some providers give each call an id that the result must refer to
  id: string | null;
  name: string;
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls: ToolCall[];
      // The provider's own copy of this reply, sent back unchanged in the
      // next request of the same answer (Gemini requires its signatures)
      providerData?: unknown;
    }
  | {
      role: "tool";
      toolCallId: string | null;
      toolName: string;
      content: string;
    };

export interface ChatRequest {
  messages: ChatMessage[];
  tools: ToolDefinition[];
}

export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
  providerData?: unknown;
}

export interface LlmProvider {
  // Name of the provider and model, e.g. "ollama:qwen3"; shown in logs
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

// The model could not be reached at all (e.g. Ollama is not running)
export class LlmUnavailableError extends Error {}
// The model did not answer within the time limit
export class LlmTimeoutError extends Error {}
// The model answered with an error (e.g. unknown model, invalid request)
export class LlmResponseError extends Error {}

import { Ollama } from "ollama";
import type { Message, Tool } from "ollama";
import {
  LlmResponseError,
  LlmTimeoutError,
  LlmUnavailableError,
} from "../../types/llm.js";
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  LlmProvider,
  ToolDefinition,
} from "../../types/llm.js";

export interface OllamaConfig {
  // http://localhost:11434 locally, https://ollama.com for Ollama Cloud
  host: string;
  model: string;
  // Only needed for Ollama Cloud
  apiKey: string | null;
  timeoutMs: number;
}

function toOllamaMessage(message: ChatMessage): Message {
  switch (message.role) {
    case "assistant":
      return {
        role: "assistant",
        content: message.content,
        // Earlier answers in a conversation have no tool calls
        ...(message.toolCalls.length > 0
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          : {}),
      };
    case "tool":
      return {
        role: "tool",
        content: message.content,
        tool_name: message.toolName,
      };
    default:
      return { role: message.role, content: message.content };
  }
}

function toOllamaTool(tool: ToolDefinition): Tool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

// Talks to a local Ollama server or to Ollama Cloud; the API is the same,
// the cloud only needs an API key.
export class OllamaProvider implements LlmProvider {
  readonly name: string;
  private readonly client: Ollama;

  constructor(private readonly config: OllamaConfig) {
    this.name = `ollama:${config.model}`;
    this.client = new Ollama({
      host: config.host,
      ...(config.apiKey
        ? { headers: { Authorization: `Bearer ${config.apiKey}` } }
        : {}),
      // Every request gets the time limit. The global fetch is looked up on
      // each call, so tests can replace it.
      fetch: (input, init) =>
        globalThis.fetch(input, {
          ...init,
          signal: AbortSignal.timeout(config.timeoutMs),
        }),
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await this.client.chat({
        model: this.config.model,
        messages: request.messages.map(toOllamaMessage),
        tools: request.tools.map(toOllamaTool),
        stream: false,
      });

      return {
        content: response.message.content ?? "",
        toolCalls: (response.message.tool_calls ?? []).map((call) => ({
          id: null,
          name: call.function.name,
          arguments: call.function.arguments ?? {},
        })),
      };
    } catch (error) {
      throw toLlmError(error, this.config);
    }
  }
}

function toLlmError(error: unknown, config: OllamaConfig): Error {
  if (error instanceof Error && error.name === "TimeoutError") {
    return new LlmTimeoutError(
      `Ollama did not answer within ${config.timeoutMs / 1000} seconds`,
    );
  }
  // The ollama library throws a ResponseError with the HTTP status
  if (
    error instanceof Error &&
    "status_code" in error &&
    typeof error.status_code === "number"
  ) {
    const hint =
      error.status_code === 404
        ? ` Is the model "${config.model}" pulled? Run: ollama pull ${config.model}`
        : "";
    return new LlmResponseError(
      `Ollama answered ${error.status_code}: ${error.message}.${hint}`,
    );
  }
  // fetch itself failed: nothing is listening at the host
  return new LlmUnavailableError(
    `Ollama could not be reached at ${config.host}. Is it running?`,
  );
}

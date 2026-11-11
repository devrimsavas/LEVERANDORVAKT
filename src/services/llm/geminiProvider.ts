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
} from "../../types/llm.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

// Shapes of the Gemini generateContent REST API, as far as they are used here
interface GeminiPart {
  text?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: unknown };
  // Must be sent back unchanged with function calls (Gemini 3 and later)
  thoughtSignature?: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: { content?: GeminiContent }[];
  error?: { message?: string };
}

// Converts the conversation into Gemini's format: a separate system
// instruction, "model" instead of "assistant", and tool results sent as
// "user" turns. Consecutive tool results go into one turn, as Gemini expects.
function toGeminiRequest(request: ChatRequest) {
  const system = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  const contents: GeminiContent[] = [];
  for (const message of request.messages) {
    const part = toGeminiTurn(message);
    if (!part) {
      continue;
    }
    const last = contents.at(-1);
    if (
      message.role === "tool" &&
      last?.role === "user" &&
      last.parts[0]?.functionResponse
    ) {
      last.parts.push(...part.parts);
    } else {
      contents.push(part);
    }
  }

  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    tools: [
      {
        functionDeclarations: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    ],
  };
}

function toGeminiTurn(message: ChatMessage): GeminiContent | null {
  switch (message.role) {
    case "system":
      return null;
    case "user":
      return { role: "user", parts: [{ text: message.content }] };
    case "assistant":
      // Send Gemini's own reply back unchanged, so its signatures are kept
      if (message.providerData) {
        return message.providerData as GeminiContent;
      }
      return {
        role: "model",
        parts: [
          ...(message.content ? [{ text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            functionCall: {
              ...(call.id ? { id: call.id } : {}),
              name: call.name,
              args: call.arguments,
            },
          })),
        ],
      };
    case "tool":
      return {
        role: "user",
        parts: [
          {
            functionResponse: {
              ...(message.toolCallId ? { id: message.toolCallId } : {}),
              name: message.toolName,
              // Gemini expects an object; the tool result is a JSON string
              response: { result: JSON.parse(message.content) as unknown },
            },
          },
        ],
      };
  }
}

// Talks to the Gemini API (Google AI Studio key) with plain fetch.
export class GeminiProvider implements LlmProvider {
  readonly name: string;

  constructor(private readonly config: GeminiConfig) {
    this.name = `gemini:${config.model}`;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(this.config.model)}:generateContent`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.config.apiKey,
        },
        body: JSON.stringify(toGeminiRequest(request)),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new LlmTimeoutError(
          `Gemini did not answer within ${this.config.timeoutMs / 1000} seconds`,
        );
      }
      throw new LlmUnavailableError("Gemini could not be reached");
    }

    const data = (await response.json().catch(() => ({}))) as GeminiResponse;

    if (!response.ok) {
      // 429: the free tier's requests per minute or per day are used up
      throw new LlmResponseError(
        `Gemini answered ${response.status}: ${data.error?.message ?? response.statusText}`,
      );
    }

    const content = data.candidates?.[0]?.content;
    const parts = content?.parts ?? [];

    return {
      content: parts
        .map((part) => part.text ?? "")
        .join("")
        .trim(),
      toolCalls: parts
        .filter((part) => part.functionCall)
        .map((part) => ({
          id: part.functionCall!.id ?? null,
          name: part.functionCall!.name,
          arguments: part.functionCall!.args ?? {},
        })),
      ...(content ? { providerData: content } : {}),
    };
  }
}

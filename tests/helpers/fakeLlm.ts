import { afterEach, beforeEach, vi } from "vitest";
import type { FakeBrreg } from "./fakeBrreg.js";

// A fake Ollama server, answering through the same fake fetch as Brreg.
// Each test queues the replies the "model" gives, in order, and can read
// every request the app sent. No real model is ever called.

export const FAKE_OLLAMA_HOST = "http://ollama.test";
export const FAKE_OLLAMA_MODEL = "test-model";

interface OllamaRequestBody {
  model: string;
  messages: {
    role: string;
    content: string;
    tool_calls?: { function: { name: string; arguments: unknown } }[];
    tool_name?: string;
  }[];
  tools: { function: { name: string } }[];
}

type FakeReply =
  | { kind: "message"; content: string; toolCalls: FakeToolCall[] }
  | { kind: "error"; status: number; error: string }
  | { kind: "down" }
  | { kind: "hang" };

export interface FakeToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface FakeOllama {
  // The body of every chat request the app sent
  requests: OllamaRequestBody[];
  reply(content: string): void;
  callTools(...calls: FakeToolCall[]): void;
  failWith(status: number, error: string): void;
  // Nothing is listening: the connection is refused
  goDown(): void;
  // Never answers, so the app's time limit is reached
  hang(): void;
  // The content of the tool results in the latest request, parsed
  toolResults(requestIndex?: number): unknown[];
}

export function useFakeOllama(brreg: FakeBrreg): FakeOllama {
  const queue: FakeReply[] = [];

  const fake: FakeOllama = {
    requests: [],
    reply(content) {
      queue.push({ kind: "message", content, toolCalls: [] });
    },
    callTools(...calls) {
      queue.push({ kind: "message", content: "", toolCalls: calls });
    },
    failWith(status, error) {
      queue.push({ kind: "error", status, error });
    },
    goDown() {
      queue.push({ kind: "down" });
    },
    hang() {
      queue.push({ kind: "hang" });
    },
    toolResults(requestIndex = fake.requests.length - 1) {
      return (fake.requests[requestIndex]?.messages ?? [])
        .filter((m) => m.role === "tool")
        .map((m) => JSON.parse(m.content) as unknown);
    },
  };

  beforeEach(() => {
    queue.length = 0;
    fake.requests.length = 0;
    vi.stubEnv("AI_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_HOST", FAKE_OLLAMA_HOST);
    vi.stubEnv("OLLAMA_MODEL", FAKE_OLLAMA_MODEL);
    vi.stubEnv("OLLAMA_API_KEY", "");
    vi.stubEnv("AI_TIMEOUT_SECONDS", "0.3");
    vi.stubEnv("ASSISTANT_DAILY_LIMIT", "20");

    brreg.extraHandlers.push(async (url, init) => {
      if (url.hostname !== "ollama.test") {
        return null;
      }
      fake.requests.push(JSON.parse(String(init?.body)) as OllamaRequestBody);

      const next = queue.shift();
      if (!next) {
        return Response.json(
          { error: "No reply queued in the test" },
          { status: 500 },
        );
      }
      switch (next.kind) {
        case "down":
          throw new TypeError("fetch failed");
        case "hang":
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal!.reason),
            );
          });
        case "error":
          return Response.json({ error: next.error }, { status: next.status });
        case "message":
          return Response.json({
            model: FAKE_OLLAMA_MODEL,
            created_at: new Date().toISOString(),
            message: {
              role: "assistant",
              content: next.content,
              ...(next.toolCalls.length > 0
                ? {
                    tool_calls: next.toolCalls.map((call) => ({
                      function: {
                        name: call.name,
                        arguments: call.arguments ?? {},
                      },
                    })),
                  }
                : {}),
            },
            done: true,
            done_reason: "stop",
          });
      }
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  return fake;
}

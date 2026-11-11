import { OllamaProvider } from "./ollamaProvider.js";
import { GeminiProvider } from "./geminiProvider.js";
import type { LlmProvider } from "../../types/llm.js";

const DEFAULT_TIMEOUT_SECONDS = 60;

// Creates the provider chosen in the environment, or null when the
// assistant is not configured. Read on every call, so a changed .env
// takes effect on restart and tests can set their own values.
//
// AI_PROVIDER=ollama   OLLAMA_HOST, OLLAMA_MODEL, OLLAMA_API_KEY (cloud only)
// AI_PROVIDER=gemini   GEMINI_API_KEY, GEMINI_MODEL
export function createLlmProvider(): LlmProvider | null {
  const env = process.env;
  const timeoutMs =
    Number(env.AI_TIMEOUT_SECONDS ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

  switch (env.AI_PROVIDER) {
    case "ollama":
      if (!env.OLLAMA_MODEL) {
        return null;
      }
      return new OllamaProvider({
        host: env.OLLAMA_HOST || "http://localhost:11434",
        model: env.OLLAMA_MODEL,
        apiKey: env.OLLAMA_API_KEY || null,
        timeoutMs,
      });
    case "gemini":
      if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) {
        return null;
      }
      return new GeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
        timeoutMs,
      });
    default:
      return null;
  }
}

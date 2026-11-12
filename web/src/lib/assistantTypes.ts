// The assistant as the API returns it (/api/assistant)

export interface AssistantStatus {
  available: boolean;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolsUsed: string[];
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
}

export type AskError =
  | "unavailable"
  | "limit"
  | "timeout"
  | "model"
  | "notFound"
  | "failed";

export type AskResult =
  | {
      ok: true;
      conversationId: string;
      message: ChatMessage;
    }
  | { ok: false; error: AskError };

// Same limit as the API
export const MAX_QUESTION_LENGTH = 1000;

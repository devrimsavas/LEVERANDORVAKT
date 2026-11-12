import "server-only";
import { apiFetch } from "./api";
import type {
  AssistantStatus,
  ConversationDetail,
  ConversationSummary,
} from "./assistantTypes";

const CONVERSATIONS_SHOWN = 30;

export async function getAssistantStatus(): Promise<AssistantStatus | null> {
  const result = await apiFetch<AssistantStatus>("/api/assistant/status");
  return result.ok ? result.data : null;
}

export async function getConversations(): Promise<
  ConversationSummary[] | null
> {
  const result = await apiFetch<{ items: ConversationSummary[] }>(
    `/api/assistant/conversations?page=1&pageSize=${CONVERSATIONS_SHOWN}`,
  );
  return result.ok ? result.data.items : null;
}

export async function getConversation(
  id: string,
): Promise<ConversationDetail | null> {
  const result = await apiFetch<ConversationDetail>(
    `/api/assistant/conversations/${id}`,
  );
  return result.ok ? result.data : null;
}

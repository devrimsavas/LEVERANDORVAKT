"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "./api";
import {
  MAX_QUESTION_LENGTH,
  type AskError,
  type AskResult,
} from "./assistantTypes";

const UUID = /^[0-9a-f-]{36}$/i;

// The API's status codes, as messages the page can show
const ERRORS: Record<number, AskError> = {
  503: "unavailable",
  429: "limit",
  504: "timeout",
  502: "model",
  404: "notFound",
};

interface AnswerResponse {
  conversationId: string;
  answer: string;
  toolsUsed: string[];
  createdAt: string;
}

export async function askQuestion(
  conversationId: string | null,
  question: string,
): Promise<AskResult> {
  const message = question.trim();
  if (message === "" || message.length > MAX_QUESTION_LENGTH) {
    return { ok: false, error: "failed" };
  }
  if (conversationId !== null && !UUID.test(conversationId)) {
    return { ok: false, error: "notFound" };
  }

  const result = await apiFetch<AnswerResponse>("/api/assistant/messages", {
    method: "POST",
    body: conversationId ? { message, conversationId } : { message },
  });
  if (!result.ok) {
    return { ok: false, error: ERRORS[result.status] ?? "failed" };
  }

  // The conversation list and the questions left change with every answer
  revalidatePath("/assistant");
  return {
    ok: true,
    conversationId: result.data.conversationId,
    message: {
      role: "assistant",
      content: result.data.answer,
      toolsUsed: result.data.toolsUsed,
      createdAt: result.data.createdAt,
    },
  };
}

export async function deleteConversation(id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const result = await apiFetch(`/api/assistant/conversations/${id}`, {
    method: "DELETE",
  });
  revalidatePath("/assistant");
  return result.ok || result.status === 404;
}

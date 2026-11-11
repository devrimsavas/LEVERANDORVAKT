import { Op } from "sequelize";
import { sequelize } from "../config/database.js";
import { AssistantConversation } from "../models/AssistantConversation.js";
import { AssistantMessage } from "../models/AssistantMessage.js";
import { AssistantUsage } from "../models/AssistantUsage.js";
import { getInternalUserId } from "./userService.js";
import { createLlmProvider } from "./llm/llmProvider.js";
import { ASSISTANT_TOOLS, executeTool } from "./assistantTools.js";
import { toOffset, toPaginated } from "../utils/pagination.js";
import type { Pagination, Paginated } from "../utils/pagination.js";
import type { ChatMessage } from "../types/llm.js";

// At most this many model calls for one question. A model that keeps
// calling tools without answering is stopped here.
export const MAX_STEPS = 5;
// The latest messages of a conversation sent to the model as context
const HISTORY_MESSAGES = 10;
export const MAX_QUESTION_LENGTH = 1000;
const DEFAULT_DAILY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const GAVE_UP_ANSWER =
  "I could not complete the answer. Please try a more specific question.";

export class AssistantNotConfiguredError extends Error {}
export class DailyLimitReachedError extends Error {}
export class ConversationNotFoundError extends Error {}

export interface AssistantAnswer {
  conversationId: string;
  answer: string;
  // The tools the answer is based on, so a client can show its sources
  toolsUsed: string[];
  createdAt: Date;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationDetail extends ConversationSummary {
  messages: {
    role: "user" | "assistant";
    content: string;
    toolsUsed: string[];
    createdAt: Date;
  }[];
}

function systemPrompt(now: Date): string {
  return [
    "You are the assistant of Leverandørvakt, a service that helps Norwegian businesses keep an eye on their suppliers and customers using public data from the Brønnøysund Register Centre.",
    `Today is ${now.toISOString().slice(0, 10)}.`,
    "Base every statement about a company on data returned by the tools. Never invent organization numbers, names or figures; use search_companies to find an organization number.",
    "If a tool returns an error or no data, say so plainly.",
    "When you talk about risk, mention that the assessment is based on public register data only and is not a credit rating.",
    "Answer in the language the user writes in. Keep answers short and concrete.",
  ].join("\n");
}

function dailyLimit(): number {
  const limit = Number(
    process.env.ASSISTANT_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT,
  );
  return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_DAILY_LIMIT;
}

// The user's conversation, or an error if it does not exist or belongs
// to someone else (the same error, so ids of others cannot be probed)
async function findConversation(
  userId: number,
  conversationId: string,
): Promise<AssistantConversation> {
  const conversation = await AssistantConversation.findOne({
    where: { publicId: conversationId, userId },
  });
  if (!conversation) {
    throw new ConversationNotFoundError("Conversation not found");
  }
  return conversation;
}

// The latest questions and answers, oldest first
async function recentHistory(conversationId: number): Promise<ChatMessage[]> {
  const latest = await AssistantMessage.findAll({
    where: { conversationId },
    order: [["id", "DESC"]],
    limit: HISTORY_MESSAGES,
  });
  return latest
    .reverse()
    .map((message) =>
      message.role === "user"
        ? { role: "user", content: message.content }
        : { role: "assistant", content: message.content, toolCalls: [] },
    );
}

// Answers a question with the help of the tools, in a new conversation
// or in one of the user's own conversations.
export async function askAssistant(
  userPublicId: string,
  question: string,
  conversationId: string | null,
): Promise<AssistantAnswer> {
  const provider = createLlmProvider();
  if (!provider) {
    throw new AssistantNotConfiguredError("The assistant is not configured");
  }

  const userId = await getInternalUserId(userPublicId);
  const conversation = conversationId
    ? await findConversation(userId, conversationId)
    : null;

  const asked = await AssistantUsage.count({
    where: {
      userId,
      createdAt: { [Op.gte]: new Date(Date.now() - DAY_MS) },
    },
  });
  if (asked >= dailyLimit()) {
    throw new DailyLimitReachedError(
      `The assistant can answer ${dailyLimit()} questions per 24 hours`,
    );
  }

  const now = new Date();
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(now) },
    ...(conversation ? await recentHistory(conversation.id) : []),
    { role: "user", content: question },
  ];
  const toolsUsed: string[] = [];
  let answer: string | null = null;

  // The agent loop: the model either answers or asks for tools; their
  // results are added to the messages and the model is asked again.
  // Model errors are not caught here: the question fails and is not stored.
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await provider.chat({ messages, tools: ASSISTANT_TOOLS });

    if (response.toolCalls.length === 0) {
      answer = response.content || GAVE_UP_ANSWER;
      break;
    }

    messages.push({
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
      providerData: response.providerData,
    });

    for (const call of response.toolCalls) {
      const result = await executeTool(call.name, call.arguments, {
        userPublicId,
      });
      if (!toolsUsed.includes(call.name)) {
        toolsUsed.push(call.name);
      }
      messages.push({
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
        content: JSON.stringify(result),
      });
    }
  }

  const finalAnswer = answer ?? GAVE_UP_ANSWER;

  // The question, the answer and the usage are saved together
  return sequelize.transaction(async (transaction) => {
    const saved =
      conversation ??
      (await AssistantConversation.create(
        { userId, title: question.slice(0, 100) },
        { transaction },
      ));

    await AssistantMessage.create(
      {
        conversationId: saved.id,
        role: "user",
        content: question,
        toolsUsed: [],
      },
      { transaction },
    );
    const reply = await AssistantMessage.create(
      {
        conversationId: saved.id,
        role: "assistant",
        content: finalAnswer,
        toolsUsed,
      },
      { transaction },
    );
    await AssistantUsage.create({ userId }, { transaction });

    // Moves the conversation to the top of the list
    saved.changed("updatedAt", true);
    await saved.save({ transaction });

    return {
      conversationId: saved.publicId,
      answer: finalAnswer,
      toolsUsed,
      createdAt: reply.createdAt,
    };
  });
}

// Lists the user's conversations, most recently used first
export async function listConversations(
  userPublicId: string,
  pagination: Pagination,
): Promise<Paginated<ConversationSummary>> {
  const userId = await getInternalUserId(userPublicId);
  const { rows, count } = await AssistantConversation.findAndCountAll({
    where: { userId },
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: pagination.pageSize,
    offset: toOffset(pagination),
  });

  return toPaginated(
    rows.map((c) => ({
      id: c.publicId,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    count,
    pagination,
  );
}

// One of the user's conversations with all its messages, oldest first
export async function getConversation(
  userPublicId: string,
  conversationId: string,
): Promise<ConversationDetail> {
  const userId = await getInternalUserId(userPublicId);
  const conversation = await findConversation(userId, conversationId);
  const messages = await AssistantMessage.findAll({
    where: { conversationId: conversation.id },
    order: [["id", "ASC"]],
  });

  return {
    id: conversation.publicId,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      toolsUsed: m.toolsUsed,
      createdAt: m.createdAt,
    })),
  };
}

// Deletes one of the user's conversations and its messages
export async function deleteConversation(
  userPublicId: string,
  conversationId: string,
): Promise<void> {
  const userId = await getInternalUserId(userPublicId);
  const conversation = await findConversation(userId, conversationId);
  await conversation.destroy();
}

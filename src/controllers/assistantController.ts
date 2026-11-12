import type { Request, Response } from "express";
import {
  askAssistant,
  AssistantNotConfiguredError,
  ConversationNotFoundError,
  DailyLimitReachedError,
  deleteConversation,
  getAssistantStatus,
  getConversation,
  listConversations,
  MAX_QUESTION_LENGTH,
} from "../services/assistantService.js";
import { UserNotFoundError } from "../services/userService.js";
import {
  LlmResponseError,
  LlmTimeoutError,
  LlmUnavailableError,
} from "../types/llm.js";
import { parsePagination } from "../utils/pagination.js";
import { isValidUuid } from "../utils/uuid.js";

// Maps service errors to HTTP responses. Returns false for unknown errors.
function sendKnownError(error: unknown, res: Response): boolean {
  if (error instanceof UserNotFoundError) {
    res.status(401).json({ error: "Your account no longer exists" });
    return true;
  }
  if (error instanceof ConversationNotFoundError) {
    res.status(404).json({ error: error.message });
    return true;
  }
  if (error instanceof DailyLimitReachedError) {
    res.status(429).json({ error: error.message });
    return true;
  }
  if (
    error instanceof AssistantNotConfiguredError ||
    error instanceof LlmUnavailableError
  ) {
    console.error(error.message);
    res.status(503).json({ error: "The assistant is not available right now" });
    return true;
  }
  if (error instanceof LlmTimeoutError) {
    console.error(error.message);
    res.status(504).json({ error: "The assistant did not answer in time" });
    return true;
  }
  if (error instanceof LlmResponseError) {
    console.error(error.message);
    res.status(502).json({ error: "The language model returned an error" });
    return true;
  }
  return false;
}

// POST /api/assistant/messages
export const askQuestion = async (req: Request, res: Response) => {
  // #swagger.tags = ["Assistant"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.requestBody = {
       required: true,
       content: { "application/json": { example: { message: "Which of my companies have the highest risk?", conversationId: null } } }
     }
     #swagger.responses[404] = { description: "Conversation not found" }
     #swagger.responses[429] = { description: "Daily question limit reached" }
     #swagger.responses[503] = { description: "The assistant is not configured or the model cannot be reached" } */
  const { message, conversationId } = req.body ?? {};

  if (typeof message !== "string" || message.trim() === "") {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (message.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({
      error: `message can be at most ${MAX_QUESTION_LENGTH} characters`,
    });
    return;
  }
  if (
    conversationId !== undefined &&
    conversationId !== null &&
    !isValidUuid(conversationId)
  ) {
    res.status(400).json({ error: "conversationId must be a UUID" });
    return;
  }

  try {
    const answer = await askAssistant(
      req.auth!.userId,
      message.trim(),
      conversationId ?? null,
    );
    res.json(answer);
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not answer the question" });
  }
};

// GET /api/assistant/status
export const getMyAssistantStatus = async (req: Request, res: Response) => {
  // #swagger.tags = ["Assistant"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.description = "Whether the assistant is available, and how many questions are left in the last 24 hours" */
  try {
    res.json(await getAssistantStatus(req.auth!.userId));
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not load the assistant status" });
  }
};

// GET /api/assistant/conversations
export const listMyConversations = async (req: Request, res: Response) => {
  // #swagger.tags = ["Assistant"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.parameters["page"] = { in: "query", type: "integer", description: "Page number, starting at 1 (default 1)" }
     #swagger.parameters["pageSize"] = { in: "query", type: "integer", description: "Items per page, 1-100 (default 20)" } */
  const pagination = parsePagination(req.query);
  if (!pagination.ok) {
    res.status(400).json({ error: pagination.error });
    return;
  }

  try {
    res.json(await listConversations(req.auth!.userId, pagination));
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not load conversations" });
  }
};

// GET /api/assistant/conversations/:id
export const getMyConversation = async (
  req: Request<{ id: string }>,
  res: Response,
) => {
  // #swagger.tags = ["Assistant"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.responses[404] = { description: "Conversation not found" } */
  if (!isValidUuid(req.params.id)) {
    res.status(400).json({ error: "Conversation id must be a UUID" });
    return;
  }

  try {
    res.json(await getConversation(req.auth!.userId, req.params.id));
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not load the conversation" });
  }
};

// DELETE /api/assistant/conversations/:id
export const deleteMyConversation = async (
  req: Request<{ id: string }>,
  res: Response,
) => {
  // #swagger.tags = ["Assistant"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.responses[404] = { description: "Conversation not found" } */
  if (!isValidUuid(req.params.id)) {
    res.status(400).json({ error: "Conversation id must be a UUID" });
    return;
  }

  try {
    await deleteConversation(req.auth!.userId, req.params.id);
    res.status(204).end();
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not delete the conversation" });
  }
};

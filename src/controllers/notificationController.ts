import type { Request, Response } from "express";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  NotificationNotFoundError,
} from "../services/notificationService.js";
import { UserNotFoundError } from "../services/userService.js";
import { parsePagination } from "../utils/pagination.js";
import { isValidUuid } from "../utils/uuid.js";

// Maps service errors to HTTP responses. Returns false for unknown errors.
function sendKnownError(error: unknown, res: Response): boolean {
  if (error instanceof UserNotFoundError) {
    res.status(401).json({ error: "Your account no longer exists" });
    return true;
  }
  if (error instanceof NotificationNotFoundError) {
    res.status(404).json({ error: error.message });
    return true;
  }
  return false;
}

// GET /api/notifications
export const listNotifications = async (req: Request, res: Response) => {
  // #swagger.tags = ["Notifications"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.parameters["unread"] = { in: "query", type: "boolean", description: "true returns only unread notifications" }
     #swagger.parameters["page"] = { in: "query", type: "integer", description: "Page number, starting at 1 (default 1)" }
     #swagger.parameters["pageSize"] = { in: "query", type: "integer", description: "Items per page, 1-100 (default 20)" } */
  const { unread } = req.query;

  if (unread !== undefined && unread !== "true" && unread !== "false") {
    res.status(400).json({ error: "unread must be true or false" });
    return;
  }

  const pagination = parsePagination(req.query);
  if (!pagination.ok) {
    res.status(400).json({ error: pagination.error });
    return;
  }

  try {
    const result = await getNotifications(
      req.auth!.userId,
      { unreadOnly: unread === "true" },
      pagination,
    );
    res.json(result);
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not load notifications" });
  }
};

// GET /api/notifications/unread-count
export const countUnread = async (req: Request, res: Response) => {
  // #swagger.tags = ["Notifications"]
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const count = await getUnreadCount(req.auth!.userId);
    res.json({ count });
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not count notifications" });
  }
};

// PATCH /api/notifications/:id/read
export const readNotification = async (
  req: Request<{ id: string }>,
  res: Response,
) => {
  // #swagger.tags = ["Notifications"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.responses[404] = { description: "Notification not found" } */
  const { id } = req.params;

  if (!isValidUuid(id)) {
    res.status(400).json({ error: "Notification id must be a UUID" });
    return;
  }

  try {
    const notification = await markAsRead(req.auth!.userId, id);
    res.json(notification);
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not update the notification" });
  }
};

// POST /api/notifications/read-all
export const readAllNotifications = async (req: Request, res: Response) => {
  // #swagger.tags = ["Notifications"]
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const updated = await markAllAsRead(req.auth!.userId);
    res.json({ updated });
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not update notifications" });
  }
};

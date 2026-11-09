import express from "express";
import {
  listNotifications,
  countUnread,
  readNotification,
  readAllNotifications,
} from "../controllers/notificationController.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

// Every notification endpoint belongs to the logged-in user
router.use(requireAuth);

router.get("/", listNotifications);
router.get("/unread-count", countUnread);
router.post("/read-all", readAllNotifications);
router.patch("/:id/read", readNotification);

export default router;

import express from "express";
import {
  askQuestion,
  deleteMyConversation,
  getMyConversation,
  listMyConversations,
} from "../controllers/assistantController.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

// The assistant answers only logged-in users, about their own data
router.use(requireAuth);

router.post("/messages", askQuestion);
router.get("/conversations", listMyConversations);
router.get("/conversations/:id", getMyConversation);
router.delete("/conversations/:id", deleteMyConversation);

export default router;

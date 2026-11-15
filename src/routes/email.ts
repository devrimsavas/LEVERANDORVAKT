import express from "express";
import { unsubscribeHandler } from "../controllers/emailController.js";

const router = express.Router();

// No login: the signed token in the link says whose emails to turn off
router.post("/unsubscribe", unsubscribeHandler);

export default router;

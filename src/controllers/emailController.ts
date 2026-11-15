import type { Request, Response } from "express";
import {
  InvalidUnsubscribeTokenError,
  unsubscribe,
} from "../services/emailNotificationService.js";

// POST /api/email/unsubscribe
export const unsubscribeHandler = async (req: Request, res: Response) => {
  // #swagger.tags = ["Email"]
  /* #swagger.description = "Turns email notifications off with the signed link from an email. No login needed." */
  try {
    await unsubscribe(req.body?.token);
    res.json({ emailNotifications: "off" });
  } catch (error) {
    if (error instanceof InvalidUnsubscribeTokenError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Could not turn the emails off" });
  }
};

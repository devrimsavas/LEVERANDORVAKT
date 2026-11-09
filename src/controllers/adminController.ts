import type { Request, Response } from "express";
import { runChangeDetectionOnce } from "../jobs/changeDetectionJob.js";

// POST /api/admin/change-detection/run
export const runChangeDetectionNow = async (req: Request, res: Response) => {
  // #swagger.tags = ["Admin"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.responses[403] = { description: "Only admins can run this" }
     #swagger.responses[409] = { description: "A run is already in progress" } */
  try {
    const summary = await runChangeDetectionOnce();

    if (summary === null) {
      res.status(409).json({ error: "Change detection is already running" });
      return;
    }

    res.json(summary);
  } catch (error) {
    console.error(error);
    res
      .status(502)
      .json({ error: "Change detection failed, see the server log" });
  }
};

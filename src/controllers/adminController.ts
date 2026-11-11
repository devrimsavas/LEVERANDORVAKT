import type { Request, Response } from "express";
import { runChangeDetectionOnce } from "../jobs/changeDetectionJob.js";
import { runAccountsCheckOnce } from "../jobs/accountsCheckJob.js";
import { getSystemStatus, listUsers } from "../services/adminService.js";
import { parsePagination } from "../utils/pagination.js";

const MAX_SEARCH_LENGTH = 100;

// GET /api/admin/status
export const getStatus = async (req: Request, res: Response) => {
  // #swagger.tags = ["Admin"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.responses[403] = { description: "Only admins can see this" } */
  try {
    res.json(await getSystemStatus());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load the system status" });
  }
};

// GET /api/admin/users
export const listUsersHandler = async (req: Request, res: Response) => {
  // #swagger.tags = ["Admin"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.parameters["q"] = { in: "query", type: "string", description: "Part of a name or email" }
     #swagger.responses[403] = { description: "Only admins can see this" } */
  const pagination = parsePagination(req.query);
  if (!pagination.ok) {
    res.status(400).json({ error: pagination.error });
    return;
  }

  const { q } = req.query;
  if (q !== undefined && typeof q !== "string") {
    res.status(400).json({ error: "q must be a single text value" });
    return;
  }
  const search = q?.trim() ?? "";
  if (search.length > MAX_SEARCH_LENGTH) {
    res
      .status(400)
      .json({ error: `q can be at most ${MAX_SEARCH_LENGTH} characters` });
    return;
  }

  try {
    res.json(await listUsers(pagination, search === "" ? null : search));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load the users" });
  }
};

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

// POST /api/admin/accounts-check/run
export const runAccountsCheckNow = async (req: Request, res: Response) => {
  // #swagger.tags = ["Admin"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.responses[403] = { description: "Only admins can run this" }
     #swagger.responses[409] = { description: "A run is already in progress" } */
  try {
    const summary = await runAccountsCheckOnce();

    if (summary === null) {
      res.status(409).json({ error: "The accounts check is already running" });
      return;
    }

    res.json(summary);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "The accounts check failed, see the server log" });
  }
};

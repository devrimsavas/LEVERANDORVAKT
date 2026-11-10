import type { Request, Response } from "express";
import {
  getWatchlist,
  addToWatchlist,
  updateWatchlistNote,
  removeFromWatchlist,
  getCompanyChanges,
  getCompanyAccounts,
  CompanyNotFoundError,
  AlreadyWatchingError,
  NotWatchingError,
} from "../services/watchlistService.js";
import { UserNotFoundError } from "../services/userService.js";
import { isValidOrgNumber } from "../utils/orgNumber.js";
import { parsePagination } from "../utils/pagination.js";

const MAX_NOTE_LENGTH = 500;

type NoteResult = { ok: true; note: string | null } | { ok: false };

// Accepts a missing note, null or a string up to 500 characters.
// An empty or whitespace-only note is stored as null.
function parseNote(value: unknown): NoteResult {
  if (value === undefined || value === null) {
    return { ok: true, note: null };
  }
  if (typeof value !== "string" || value.trim().length > MAX_NOTE_LENGTH) {
    return { ok: false };
  }
  const trimmed = value.trim();
  return { ok: true, note: trimmed.length > 0 ? trimmed : null };
}

// Maps service errors to HTTP responses. Returns false for unknown errors.
function sendKnownError(error: unknown, res: Response): boolean {
  if (error instanceof UserNotFoundError) {
    res.status(401).json({ error: "Your account no longer exists" });
    return true;
  }
  if (
    error instanceof CompanyNotFoundError ||
    error instanceof NotWatchingError
  ) {
    res.status(404).json({ error: error.message });
    return true;
  }
  if (error instanceof AlreadyWatchingError) {
    res.status(409).json({ error: error.message });
    return true;
  }
  return false;
}

// GET /api/watchlist
export const listWatchlist = async (req: Request, res: Response) => {
  // #swagger.tags = ["Watchlist"]
  /* #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const items = await getWatchlist(req.auth!.userId);
    res.json(items);
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not load the watchlist" });
  }
};

// POST /api/watchlist
export const addCompany = async (req: Request, res: Response) => {
  // #swagger.tags = ["Watchlist"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.responses[404] = { description: "Company not found in the Brønnøysund Register or struck off" }
     #swagger.responses[409] = { description: "Company is already on the watchlist" } */
  const { orgNumber, note } = req.body ?? {};

  if (!isValidOrgNumber(orgNumber)) {
    res.status(400).json({ error: "Organization number must be 9 digits" });
    return;
  }

  const parsedNote = parseNote(note);
  if (!parsedNote.ok) {
    res.status(400).json({
      error: `Note must be text of at most ${MAX_NOTE_LENGTH} characters`,
    });
    return;
  }

  try {
    const item = await addToWatchlist(
      req.auth!.userId,
      orgNumber,
      parsedNote.note,
    );
    res.status(201).json(item);
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    // The only remaining failure is the Brreg call
    res.status(502).json({ error: "Could not reach the Brreg API" });
  }
};

// PATCH /api/watchlist/:orgNumber
export const updateNote = async (
  req: Request<{ orgNumber: string }>,
  res: Response,
) => {
  // #swagger.tags = ["Watchlist"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.requestBody = {
       required: true,
       content: { "application/json": { schema: { type: "object", properties: { note: { type: "string", nullable: true } } } } }
     }
     #swagger.responses[404] = { description: "Company is not on the watchlist" } */
  const { orgNumber } = req.params;

  if (!isValidOrgNumber(orgNumber)) {
    res.status(400).json({ error: "Organization number must be 9 digits" });
    return;
  }

  const parsedNote = parseNote(req.body?.note);
  if (!parsedNote.ok) {
    res.status(400).json({
      error: `Note must be text of at most ${MAX_NOTE_LENGTH} characters`,
    });
    return;
  }

  try {
    const item = await updateWatchlistNote(
      req.auth!.userId,
      orgNumber,
      parsedNote.note,
    );
    res.json(item);
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not update the note" });
  }
};

// DELETE /api/watchlist/:orgNumber
export const removeCompany = async (
  req: Request<{ orgNumber: string }>,
  res: Response,
) => {
  // #swagger.tags = ["Watchlist"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.responses[404] = { description: "Company is not on the watchlist" } */
  const { orgNumber } = req.params;

  if (!isValidOrgNumber(orgNumber)) {
    res.status(400).json({ error: "Organization number must be 9 digits" });
    return;
  }

  try {
    await removeFromWatchlist(req.auth!.userId, orgNumber);
    res.status(204).end();
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not remove the company" });
  }
};

// GET /api/watchlist/:orgNumber/changes
export const listCompanyChanges = async (
  req: Request<{ orgNumber: string }>,
  res: Response,
) => {
  // #swagger.tags = ["Watchlist"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.parameters["page"] = { in: "query", type: "integer", description: "Page number, starting at 1 (default 1)" }
     #swagger.parameters["pageSize"] = { in: "query", type: "integer", description: "Items per page, 1-100 (default 20)" }
     #swagger.responses[404] = { description: "Company is not on the watchlist" } */
  const { orgNumber } = req.params;

  if (!isValidOrgNumber(orgNumber)) {
    res.status(400).json({ error: "Organization number must be 9 digits" });
    return;
  }

  const pagination = parsePagination(req.query);
  if (!pagination.ok) {
    res.status(400).json({ error: pagination.error });
    return;
  }

  try {
    const result = await getCompanyChanges(
      req.auth!.userId,
      orgNumber,
      pagination,
    );
    res.json(result);
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not load the change history" });
  }
};

// GET /api/watchlist/:orgNumber/accounts
export const listCompanyAccounts = async (
  req: Request<{ orgNumber: string }>,
  res: Response,
) => {
  // #swagger.tags = ["Watchlist"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.responses[404] = { description: "Company is not on the watchlist" } */
  const { orgNumber } = req.params;

  if (!isValidOrgNumber(orgNumber)) {
    res.status(400).json({ error: "Organization number must be 9 digits" });
    return;
  }

  try {
    const result = await getCompanyAccounts(req.auth!.userId, orgNumber);
    res.json(result);
  } catch (error) {
    if (sendKnownError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Could not load the annual accounts" });
  }
};

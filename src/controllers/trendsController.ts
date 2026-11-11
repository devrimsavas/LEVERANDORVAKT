import type { Request, Response } from "express";
import {
  getIndustryBreakdown,
  getMunicipalities,
  getRegistrationTrend,
  parseIndustryLevel,
  parseTrendParams,
  TrendInputError,
} from "../services/trendsService.js";
import type { TrendParams } from "../services/trendsService.js";

// Reads the query parameters; answers 400 and returns null if they are invalid
function parse(req: Request, res: Response): TrendParams | null {
  try {
    return parseTrendParams(req.query);
  } catch (error) {
    if (error instanceof TrendInputError) {
      res.status(400).json({ error: error.message });
      return null;
    }
    throw error;
  }
}

// GET /api/trends/registrations
export const registrationTrend = async (req: Request, res: Response) => {
  // #swagger.tags = ["Trends"]
  /* #swagger.parameters["municipality"] = { in: "query", type: "string", description: "4-digit municipality number, e.g. 5601 (Alta)" }
     #swagger.parameters["industry"] = { in: "query", type: "string", description: "Industry code or its start, e.g. 55 (accommodation) or 55.100" }
     #swagger.parameters["form"] = { in: "query", type: "string", description: "Organization form, e.g. AS" }
     #swagger.parameters["from"] = { in: "query", type: "string", description: "First month, e.g. 2025-11 (default: 11 months before to)" }
     #swagger.parameters["to"] = { in: "query", type: "string", description: "Last month, e.g. 2026-10 (default: the current month)" } */
  const params = parse(req, res);
  if (!params) return;

  try {
    res.json(await getRegistrationTrend(params));
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Could not reach the Brreg API" });
  }
};

// GET /api/trends/industries
export const industryBreakdown = async (req: Request, res: Response) => {
  // #swagger.tags = ["Trends"]
  /* #swagger.parameters["municipality"] = { in: "query", type: "string", description: "4-digit municipality number, e.g. 5601 (Alta)" }
     #swagger.parameters["industry"] = { in: "query", type: "string", description: "Industry code or its start, e.g. 55" }
     #swagger.parameters["form"] = { in: "query", type: "string", description: "Organization form, e.g. AS" }
     #swagger.parameters["from"] = { in: "query", type: "string", description: "First month, e.g. 2025-11" }
     #swagger.parameters["to"] = { in: "query", type: "string", description: "Last month, e.g. 2026-10" }
     #swagger.parameters["level"] = { in: "query", type: "string", description: "division (default): main industries, e.g. 62 IT; detailed: full codes, e.g. 62.100" } */
  const params = parse(req, res);
  if (!params) return;

  let level;
  try {
    level = parseIndustryLevel(req.query.level);
  } catch (error) {
    if (error instanceof TrendInputError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  try {
    res.json(await getIndustryBreakdown(params, level));
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Could not reach the Brreg API" });
  }
};

// GET /api/trends/municipalities
export const listMunicipalities = async (_req: Request, res: Response) => {
  // #swagger.tags = ["Trends"]
  try {
    res.json(await getMunicipalities());
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Could not reach Kartverket" });
  }
};

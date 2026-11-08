import express from "express";
import type { Request, Response } from "express";
import { getCompany, searchCompanies } from "../services/brregService.js";

const router = express.Router();

// GET /api/companies
router.get("/", (req: Request, res: Response) => {
  res.json({ message: "Companies API" });
});

// GET /api/companies/search?name=...
router.get("/search", async (req: Request, res: Response) => {
  const name = req.query.name;

  if (typeof name !== "string" || name.trim().length < 2) {
    res
      .status(400)
      .json({ error: "Query parameter 'name' must be at least 2 characters" });
    return;
  }

  try {
    const companies = await searchCompanies(name.trim());
    res.json(companies);
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Could not reach the Brreg API" });
  }
});

// GET /api/companies/:orgNumber
router.get(
  "/:orgNumber",
  async (req: Request<{ orgNumber: string }>, res: Response) => {
    const { orgNumber } = req.params;

    // Norwegian organization numbers are exactly 9 digits
    if (!/^\d{9}$/.test(orgNumber)) {
      res.status(400).json({ error: "Organization number must be 9 digits" });
      return;
    }

    try {
      const company = await getCompany(orgNumber);

      if (!company) {
        res.status(404).json({ error: "Company not found" });
        return;
      }

      res.json(company);
    } catch (error) {
      console.error(error);
      res.status(502).json({ error: "Could not reach the Brreg API" });
    }
  },
);

export default router;

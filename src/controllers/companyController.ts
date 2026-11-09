import type { Request, Response } from "express";
import {
  getCompany,
  getCompanyRoles,
  searchCompanies,
} from "../services/brregService.js";

import { isValidOrgNumber } from "../utils/orgNumber.js";

// GET /api/companies
export const getCompaniesInfo = (req: Request, res: Response) => {
  // #swagger.tags = ["Companies"]
  res.json({ message: "Companies API" });
};

// GET /api/companies/search?name=...
export const searchCompaniesByName = async (req: Request, res: Response) => {
  // #swagger.tags = ["Companies"]
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
};

// GET /api/companies/:orgNumber
export const getCompanyByOrgNumber = async (
  req: Request<{ orgNumber: string }>,
  res: Response,
) => {
  // #swagger.tags = ["Companies"]
  const { orgNumber } = req.params;

  // Norwegian organization numbers are exactly 9 digits
  if (!isValidOrgNumber(orgNumber)) {
    res.status(400).json({ error: "Organization number must be 9 digits" });
    return;
  }

  try {
    const company = await getCompany(orgNumber);

    if (!company) {
      res
        .status(404)
        .json({ error: "Company not found or struck off the register" });
      return;
    }

    res.json(company);
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Could not reach the Brreg API" });
  }
};

// GET /api/companies/:orgNumber/roles
export const getRolesByOrgNumber = async (
  req: Request<{ orgNumber: string }>,
  res: Response,
) => {
  // #swagger.tags = ["Companies"]
  /* #swagger.responses[404] = { description: "Company not found in the Brønnøysund Register" } */
  const { orgNumber } = req.params;

  if (!isValidOrgNumber(orgNumber)) {
    res.status(400).json({ error: "Organization number must be 9 digits" });
    return;
  }

  try {
    const roles = await getCompanyRoles(orgNumber);

    if (!roles) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    res.json(roles);
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Could not reach the Brreg API" });
  }
};

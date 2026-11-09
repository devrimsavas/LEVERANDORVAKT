import express from "express";
import {
  getCompaniesInfo,
  searchCompaniesByName,
  getCompanyByOrgNumber,
  getRolesByOrgNumber,
  getAccountsByOrgNumber,
} from "../controllers/companyController.js";

const router = express.Router();

router.get("/", getCompaniesInfo);
router.get("/search", searchCompaniesByName); // must stay above /:orgNumber
router.get("/:orgNumber", getCompanyByOrgNumber);
router.get("/:orgNumber/roles", getRolesByOrgNumber);
router.get("/:orgNumber/accounts", getAccountsByOrgNumber);

export default router;

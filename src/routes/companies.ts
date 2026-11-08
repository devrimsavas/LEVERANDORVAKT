import express from "express";
import {
  getCompaniesInfo,
  searchCompaniesByName,
  getCompanyByOrgNumber,
} from "../controllers/companyController.js";

const router = express.Router();

router.get("/", getCompaniesInfo);
router.get("/search", searchCompaniesByName); // must stay above /:orgNumber
router.get("/:orgNumber", getCompanyByOrgNumber);

export default router;

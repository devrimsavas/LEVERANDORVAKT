import express from "express";
import {
  listWatchlist,
  addCompany,
  getWatchedCompany,
  updateNote,
  removeCompany,
  listCompanyChanges,
  listCompanyAccounts,
  getCompanyRiskReport,
  listConnections,
  exportWatchlistCsv,
  exportChangesCsv,
} from "../controllers/watchlistController.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

// Every watchlist endpoint belongs to the logged-in user
router.use(requireAuth);

router.get("/", listWatchlist);
router.get("/connections", listConnections);
// Before the /:orgNumber routes, which would take "export" for a number
router.get("/export/companies", exportWatchlistCsv);
router.get("/export/changes", exportChangesCsv);
router.post("/", addCompany);
router.get("/:orgNumber", getWatchedCompany);
router.patch("/:orgNumber", updateNote);
router.delete("/:orgNumber", removeCompany);
router.get("/:orgNumber/changes", listCompanyChanges);
router.get("/:orgNumber/accounts", listCompanyAccounts);
router.get("/:orgNumber/risk", getCompanyRiskReport);

export default router;

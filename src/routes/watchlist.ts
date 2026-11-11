import express from "express";
import {
  listWatchlist,
  addCompany,
  updateNote,
  removeCompany,
  listCompanyChanges,
  listCompanyAccounts,
  getCompanyRiskReport,
} from "../controllers/watchlistController.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

// Every watchlist endpoint belongs to the logged-in user
router.use(requireAuth);

router.get("/", listWatchlist);
router.post("/", addCompany);
router.patch("/:orgNumber", updateNote);
router.delete("/:orgNumber", removeCompany);
router.get("/:orgNumber/changes", listCompanyChanges);
router.get("/:orgNumber/accounts", listCompanyAccounts);
router.get("/:orgNumber/risk", getCompanyRiskReport);

export default router;

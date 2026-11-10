import express from "express";
import {
  runAccountsCheckNow,
  runChangeDetectionNow,
} from "../controllers/adminController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// Every admin endpoint requires a logged-in admin
router.use(requireAuth, requireRole("admin"));

router.post("/change-detection/run", runChangeDetectionNow);
router.post("/accounts-check/run", runAccountsCheckNow);

export default router;

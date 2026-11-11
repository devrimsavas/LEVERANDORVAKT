import express from "express";
import {
  industryBreakdown,
  listMunicipalities,
  registrationTrend,
} from "../controllers/trendsController.js";

// Public, like the company endpoints: the data is open register data
const router = express.Router();

router.get("/registrations", registrationTrend);
router.get("/industries", industryBreakdown);
router.get("/municipalities", listMunicipalities);

export default router;

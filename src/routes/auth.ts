import express from "express";
import {
  register,
  login,
  me,
  getMyOnboarding,
  dismissMyOnboarding,
} from "../controllers/authController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import {
  loginPerAccountLimit,
  loginPerAddressLimit,
  registerLimit,
} from "../middlewares/rateLimits.js";

const router = express.Router();

router.post("/register", registerLimit, register);
router.post("/login", loginPerAddressLimit, loginPerAccountLimit, login);
router.get("/me", requireAuth, me);
router.get("/me/onboarding", requireAuth, getMyOnboarding);
router.post("/me/onboarding/dismiss", requireAuth, dismissMyOnboarding);

export default router;

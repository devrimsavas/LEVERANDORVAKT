import express from "express";
import {
  register,
  login,
  me,
  getMyOnboarding,
  dismissMyOnboarding,
  requestPasswordResetHandler,
  checkPasswordResetToken,
  confirmPasswordReset,
} from "../controllers/authController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import {
  changeMyPassword,
  deleteMyAccount,
  exportMyData,
} from "../controllers/accountController.js";
import {
  passwordCheckLimit,
  loginPerAccountLimit,
  loginPerAddressLimit,
  registerLimit,
  passwordResetPerAccountLimit,
  passwordResetPerAddressLimit,
} from "../middlewares/rateLimits.js";

const router = express.Router();

router.post("/register", registerLimit, register);
router.post("/login", loginPerAddressLimit, loginPerAccountLimit, login);
router.post(
  "/password-reset",
  passwordResetPerAddressLimit,
  passwordResetPerAccountLimit,
  requestPasswordResetHandler,
);
router.post("/password-reset/check", checkPasswordResetToken);
router.post("/password-reset/confirm", confirmPasswordReset);
router.get("/me", requireAuth, me);
router.delete("/me", requireAuth, passwordCheckLimit, deleteMyAccount);
router.post("/me/password", requireAuth, passwordCheckLimit, changeMyPassword);
router.get("/me/export", requireAuth, exportMyData);
router.get("/me/onboarding", requireAuth, getMyOnboarding);
router.post("/me/onboarding/dismiss", requireAuth, dismissMyOnboarding);

export default router;

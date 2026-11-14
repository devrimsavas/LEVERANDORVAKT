import type { Request, Response } from "express";
import {
  registerUser,
  loginUser,
  getUserByPublicId,
  EmailTakenError,
  InvalidCredentialsError,
} from "../services/authService.js";
import {
  dismissOnboarding,
  getOnboarding,
} from "../services/onboardingService.js";
import {
  InvalidResetTokenError,
  isResetTokenValid,
  requestPasswordReset,
  resetPassword,
} from "../services/passwordResetService.js";
import { toEmailLanguage } from "../services/email/templates.js";
import { loginPerAccountLimit } from "../middlewares/rateLimits.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 100;

function isValidName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_NAME_LENGTH
  );
}

// POST /api/auth/register
export const register = async (req: Request, res: Response) => {
  // #swagger.tags = ["Auth"]
  const { firstName, lastName, email, password } = req.body ?? {};

  if (!isValidName(firstName) || !isValidName(lastName)) {
    res.status(400).json({
      error: `First and last name are required (max ${MAX_NAME_LENGTH} characters)`,
    });
    return;
  }

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
    return;
  }

  try {
    const user = await registerUser({ firstName, lastName, email, password });
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof EmailTakenError) {
      res.status(409).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Registration failed" });
  }
};

// POST /api/auth/login
export const login = async (req: Request, res: Response) => {
  // #swagger.tags = ["Auth"]
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    const result = await loginUser(email, password);
    res.json(result);
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      res.status(401).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
};

// GET /api/auth/me
export const me = async (req: Request, res: Response) => {
  // #swagger.tags = ["Auth"]
  /* #swagger.security = [{ "bearerAuth": [] }] */

  // requireAuth has already verified the token
  const userId = req.auth!.userId;

  try {
    const user = await getUserByPublicId(userId);

    // The token is valid, but the account has been deleted
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load the user" });
  }
};

// GET /api/auth/me/onboarding
export const getMyOnboarding = async (req: Request, res: Response) => {
  // #swagger.tags = ["Auth"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.description = "The getting-started steps the user has done, read from their data, and whether the list was closed" */
  try {
    const onboarding = await getOnboarding(req.auth!.userId);
    if (!onboarding) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(onboarding);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load the getting-started steps" });
  }
};

// POST /api/auth/me/onboarding/dismiss
export const dismissMyOnboarding = async (req: Request, res: Response) => {
  // #swagger.tags = ["Auth"]
  /* #swagger.security = [{ "bearerAuth": [] }]
     #swagger.description = "Closes the getting-started list for good" */
  try {
    const onboarding = await dismissOnboarding(req.auth!.userId);
    if (!onboarding) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(onboarding);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not close the getting-started list" });
  }
};

// POST /api/auth/password-reset
export const requestPasswordResetHandler = async (
  req: Request,
  res: Response,
) => {
  // #swagger.tags = ["Auth"]
  /* #swagger.description = "Sends a password reset link if an account has this email. Always answers 202, so it does not reveal who has an account. language (en or nb) is the language of the email." */
  const { email, language } = req.body ?? {};

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }

  // Answered before the work is done, so the time it takes cannot tell
  // whether the account exists either
  res.status(202).json({
    message: "If an account has this email, a reset link has been sent",
  });
  requestPasswordReset(email, toEmailLanguage(language)).catch((error) => {
    console.error("Password reset email failed:", error);
  });
};

// POST /api/auth/password-reset/check
export const checkPasswordResetToken = async (req: Request, res: Response) => {
  // #swagger.tags = ["Auth"]
  /* #swagger.description = "Whether a reset link still works" */
  const { token } = req.body ?? {};
  try {
    res.json({ valid: await isResetTokenValid(token) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not check the link" });
  }
};

// POST /api/auth/password-reset/confirm
export const confirmPasswordReset = async (req: Request, res: Response) => {
  // #swagger.tags = ["Auth"]
  /* #swagger.description = "Sets a new password with a reset link. Every existing session of the user ends." */
  const { token, password } = req.body ?? {};

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
    return;
  }

  try {
    const email = await resetPassword(token, password);
    // The user has proved they own the account, so earlier wrong
    // passwords no longer hold them back
    await loginPerAccountLimit.resetKey(`account:${email}`);
    res.status(204).end();
  } catch (error) {
    if (error instanceof InvalidResetTokenError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Could not set the new password" });
  }
};

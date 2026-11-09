import type { Request, Response } from "express";
import {
  registerUser,
  loginUser,
  getUserByPublicId,
  EmailTakenError,
  InvalidCredentialsError,
} from "../services/authService.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
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

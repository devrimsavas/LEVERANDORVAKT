import type { Request, Response } from "express";
import {
  registerUser,
  loginUser,
  EmailTakenError,
  InvalidCredentialsError,
} from "../services/authService.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// POST /api/auth/register
export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    res
      .status(400)
      .json({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    return;
  }

  try {
    const user = await registerUser(email, password);
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
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    const result = await loginUser(email, password);
    res.json( result );
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      res.status(401).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
};

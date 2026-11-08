import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { User } from "../models/User.js";

const SALT_ROUNDS = 10;

export class EmailTakenError extends Error {}
export class InvalidCredentialsError extends Error {}

export interface PublicUser {
  id: string;
  email: string;
}

export interface LoginResult {
  token: string;
  user: PublicUser;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

// Creates a new user with a hashed password.
export async function registerUser(
  email: string,
  password: string,
): Promise<PublicUser> {
  const normalizedEmail = normalizeEmail(email);

  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) {
    throw new EmailTakenError("Email is already registered");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ email: normalizedEmail, passwordHash });

  return { id: user.id, email: user.email };
}

// Checks the credentials and returns a signed JWT with the user's public data.
export async function loginUser(
  email: string,
  password: string,
): Promise<LoginResult> {
  const user = await User.findOne({ where: { email: normalizeEmail(email) } });

  // Same error for unknown email and wrong password
  if (!user) {
    throw new InvalidCredentialsError("Invalid email or password");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new InvalidCredentialsError("Invalid email or password");
  }

  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "1d") as NonNullable<
      SignOptions["expiresIn"]
    >,
  };
  const token = jwt.sign({ sub: String(user.id) }, getJwtSecret(), options);

  return {
    token,
    user: { id: user.id, email: user.email },
  };
}

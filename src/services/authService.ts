import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { User } from "../models/User.js";
import type { UserRole } from "../models/User.js";

export const SALT_ROUNDS = 10;

export class EmailTakenError extends Error {}
export class InvalidCredentialsError extends Error {}

// User data that is safe to send to clients.
// "userId" is the public user number; the internal database id is never exposed.
export interface PublicUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: PublicUser;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

// Converts a User row into the data that is safe to send to clients.
// The password hash and the internal database id never leave this service.
export function toPublicUser(user: User): PublicUser {
  return {
    userId: user.publicId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

// Creates a new user with a hashed password.
// The role is never taken from the input: new users are always "user".
export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const email = normalizeEmail(input.email);

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    throw new EmailTakenError("Email is already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await User.create({
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email,
    passwordHash,
  });

  return toPublicUser(user);
}

// Checks the credentials, records the login time and returns a signed JWT
// together with the user's public data.
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

  user.lastLoginAt = new Date();
  await user.save();

  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "1d") as NonNullable<
      SignOptions["expiresIn"]
    >,
  };

  // "sub" holds the public user number, not the internal database id
  const token = jwt.sign(
    { sub: user.publicId, role: user.role },
    getJwtSecret(),
    options,
  );

  return { token, user: toPublicUser(user) };
}

// Returns the public data of the user with the given public id,
// or null if the user no longer exists.
export async function getUserByPublicId(
  publicId: string,
): Promise<PublicUser | null> {
  const user = await User.findOne({ where: { publicId } });
  return user ? toPublicUser(user) : null;
}

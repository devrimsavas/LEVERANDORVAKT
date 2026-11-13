import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../services/authService.js";
import { User, type UserRole } from "../models/User.js";

interface TokenPayload {
  sub: string;
  role: UserRole;
  iat?: number;
  iatMs?: number;
}

function isTokenPayload(value: unknown): value is TokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === "string" &&
    (payload.role === "user" || payload.role === "admin")
  );
}

// Lets the request through only with a valid "Authorization: Bearer <token>" header.
// On success, req.auth holds the user's public id and role.
// A token from before the user's last password change is refused, so a
// password reset ends every other session.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  let payload: unknown;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch {
    // Expired, tampered or malformed token
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  if (!isTokenPayload(payload)) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  try {
    const user = await User.findOne({
      where: { publicId: payload.sub },
      attributes: ["passwordChangedAt"],
    });
    // A deleted user is left to the route, which answers 404
    const changedAt = user?.passwordChangedAt;
    // When the token was made, to the millisecond; tokens from before
    // "iatMs" was added only have whole seconds
    const issuedAt =
      typeof payload.iatMs === "number"
        ? payload.iatMs
        : (payload.iat ?? 0) * 1000;
    if (changedAt && issuedAt < changedAt.getTime()) {
      res
        .status(401)
        .json({ error: "The password has changed. Log in again." });
      return;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not check the session" });
    return;
  }

  req.auth = { userId: payload.sub, role: payload.role };
  next();
}

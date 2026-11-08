import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../services/authService.js";
import type { UserRole } from "../models/User.js";

interface TokenPayload {
  sub: string;
  role: UserRole;
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
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const payload = jwt.verify(token, getJwtSecret());

    if (!isTokenPayload(payload)) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    req.auth = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    // Expired, tampered or malformed token
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

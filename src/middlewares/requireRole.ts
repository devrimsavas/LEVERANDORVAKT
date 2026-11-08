import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "../models/User.js";

// Must run after requireAuth. Lets the request through only for the given roles.
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: "You do not have permission to do this" });
      return;
    }
    next();
  };
}

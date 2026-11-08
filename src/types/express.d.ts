import type { UserRole } from "../models/User.js";

// Adds the authenticated user to Express requests.
// requireAuth fills it in after verifying the token.
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRole;
      };
    }
  }
}

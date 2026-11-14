import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { apiFetch } from "./api";
import { getSessionToken } from "./session";

export interface CurrentUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
}

// The logged-in user, asked from the API once per request (cache shares the
// answer between the layout and the page). null when not logged in.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!(await getSessionToken())) return null;
  const result = await apiFetch<CurrentUser>("/api/auth/me");
  return result.ok ? result.data : null;
});

// For pages that need a login. A cookie whose token the API no longer
// accepts (expired, account deleted) is cleared by /session-expired.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/session-expired");
  return user;
}

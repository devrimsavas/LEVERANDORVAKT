import "server-only";
import { cookies } from "next/headers";

// The API token is kept in an httpOnly cookie: the browser sends it to the
// Next server with every request, but JavaScript on the page cannot read it.
export const SESSION_COOKIE = "session";

// Reads when the token expires from its payload. The signature is checked by
// the API on every call; this is only used to give the cookie the same
// lifetime as the token.
export function tokenExpiresAt(token: string): Date | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const { exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof exp === "number" ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
}

export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function startSession(token: string): Promise<void> {
  const expires = tokenExpiresAt(token) ?? undefined;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(expires ? { expires } : {}),
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

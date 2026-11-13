import "server-only";
import { apiFetch } from "./api";

// Whether a reset link still works; null when the API did not answer
export async function isResetLinkValid(token: string): Promise<boolean | null> {
  const result = await apiFetch<{ valid: boolean }>(
    "/api/auth/password-reset/check",
    { method: "POST", body: { token }, auth: false },
  );
  return result.ok ? result.data.valid : null;
}

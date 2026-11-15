"use server";

import { apiFetch } from "./api";
import { text } from "./formData";

export interface UnsubscribeState {
  done?: boolean;
  error?: "linkInvalid" | "unavailable";
}

// Turns the emails off with the signed token from the link in an email.
// No login is needed: the token itself shows whose emails they are.
export async function unsubscribeAction(
  _previous: UnsubscribeState,
  formData: FormData,
): Promise<UnsubscribeState> {
  const token = text(formData, "token");
  if (!token) return { error: "linkInvalid" };

  const result = await apiFetch("/api/email/unsubscribe", {
    method: "POST",
    body: { token },
    auth: false,
  });
  if (result.ok) return { done: true };
  return { error: result.status === 400 ? "linkInvalid" : "unavailable" };
}

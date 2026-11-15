"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "./api";
import { isEmailNotifications, type EmailNotifications } from "./preferences";

export interface EmailNotificationsState {
  saved?: EmailNotifications;
  error?: "unavailable";
}

// Saves when the user wants notification emails: at once, a daily
// summary or never
export async function saveEmailNotificationsAction(
  _previous: EmailNotificationsState,
  formData: FormData,
): Promise<EmailNotificationsState> {
  const choice = formData.get("emailNotifications");
  if (!isEmailNotifications(choice)) return { error: "unavailable" };

  const result = await apiFetch("/api/auth/me/preferences", {
    method: "PATCH",
    body: { emailNotifications: choice },
  });
  if (!result.ok) return { error: "unavailable" };
  revalidatePath("/settings");
  return { saved: choice };
}

"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "./api";
import { MIN_PASSWORD_LENGTH } from "./authRules";
import type { AuthFormState } from "./authActions";
import { retryMinutes, text } from "./formData";
import { endSession, startSession } from "./session";

// Changes the password. The API ends every session, this one too, and
// answers with a new token, which becomes this browser's session.
export async function changePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const currentPassword = text(formData, "currentPassword");
  const newPassword = text(formData, "password");
  const confirmPassword = text(formData, "confirmPassword");

  const fieldErrors: AuthFormState["fieldErrors"] = {};
  if (!currentPassword) fieldErrors.currentPassword = "passwordRequired";
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = "passwordTooShort";
  } else if (confirmPassword !== newPassword) {
    fieldErrors.confirmPassword = "passwordMismatch";
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const result = await apiFetch<{ token: string }>("/api/auth/me/password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
  if (result.ok) {
    await startSession(result.data.token);
    return { changed: true };
  }
  if (result.status === 401) {
    return { fieldErrors: { currentPassword: "passwordWrong" } };
  }
  if (result.status === 429) {
    return {
      formError: "tooManyChecks",
      retryMinutes: retryMinutes(result.retryAfterSeconds),
    };
  }
  return { formError: "unavailable" };
}

// Deletes the account after the password is typed again, ends the session
// and goes to the front page, which says the account is gone
export async function deleteAccountAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = text(formData, "password");
  if (!password) {
    return { fieldErrors: { password: "passwordRequired" } };
  }

  const result = await apiFetch("/api/auth/me", {
    method: "DELETE",
    body: { password },
  });
  if (result.ok) {
    await endSession();
    redirect("/?deleted=1");
  }
  if (result.status === 401) {
    return { fieldErrors: { password: "passwordWrong" } };
  }
  if (result.status === 409) {
    return { formError: "lastAdmin" };
  }
  if (result.status === 429) {
    return {
      formError: "tooManyChecks",
      retryMinutes: retryMinutes(result.retryAfterSeconds),
    };
  }
  return { formError: "unavailable" };
}

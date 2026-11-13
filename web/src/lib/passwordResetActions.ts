"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { apiFetch } from "./api";
import { EMAIL_PATTERN, MIN_PASSWORD_LENGTH } from "./authRules";
import type { AuthFormState } from "./authActions";
import { retryMinutes, text } from "./formData";

// "Forgot your password?": asks the API to email a reset link. The answer
// is the same whether or not an account has the email, so the form never
// tells who has an account.
export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = text(formData, "email").trim();
  const values = { email };
  if (!EMAIL_PATTERN.test(email)) {
    return { fieldErrors: { email: "emailInvalid" }, values };
  }

  const result = await apiFetch("/api/auth/password-reset", {
    method: "POST",
    // The email is written in the language the user is reading the site in
    body: { email, language: await getLocale() },
    auth: false,
  });
  if (result.ok) {
    return { sent: true, values };
  }
  if (result.status === 429) {
    return {
      formError: "tooManyResets",
      retryMinutes: retryMinutes(result.retryAfterSeconds),
      values,
    };
  }
  return { formError: "unavailable", values };
}

// Sets the new password with the token from the link, then sends the user
// to log in with it
export async function resetPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = text(formData, "token");
  const password = text(formData, "password");
  const confirmPassword = text(formData, "confirmPassword");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { fieldErrors: { password: "passwordTooShort" } };
  }
  if (confirmPassword !== password) {
    return { fieldErrors: { confirmPassword: "passwordMismatch" } };
  }

  const result = await apiFetch("/api/auth/password-reset/confirm", {
    method: "POST",
    body: { token, password },
    auth: false,
  });
  if (result.ok) {
    redirect("/login?reset=1");
  }
  if (result.status === 400) {
    return { formError: "linkInvalid" };
  }
  return { formError: "unavailable" };
}

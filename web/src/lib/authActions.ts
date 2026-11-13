"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "./api";
import { endSession, startSession } from "./session";
import { safeNextPath } from "./redirect";
import { retryMinutes, text } from "./formData";
import {
  EMAIL_PATTERN,
  MAX_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "./authRules";

// Messages are returned as translation keys under "auth.errors", so the
// form shows them in the user's language
export type AuthErrorKey =
  | "firstNameRequired"
  | "lastNameRequired"
  | "nameTooLong"
  | "emailInvalid"
  | "passwordRequired"
  | "passwordTooShort"
  | "passwordMismatch"
  | "emailTaken"
  | "invalidCredentials"
  | "tooManyLogins"
  | "tooManyAccounts"
  | "tooManyResets"
  | "linkInvalid"
  | "unavailable";

export interface AuthFormState {
  formError?: AuthErrorKey;
  fieldErrors?: Partial<
    Record<
      "firstName" | "lastName" | "email" | "password" | "confirmPassword",
      AuthErrorKey
    >
  >;
  // Typed values are sent back so the form keeps them; never the password
  values?: { firstName?: string; lastName?: string; email?: string };
  // With tooManyLogins, tooManyAccounts and tooManyResets: when to try again
  retryMinutes?: number;
  // The password reset form: the email has been handled
  sent?: boolean;
}

async function logIn(email: string, password: string) {
  return apiFetch<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = text(formData, "email").trim();
  const password = text(formData, "password");
  const values = { email };

  const fieldErrors: AuthFormState["fieldErrors"] = {};
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = "emailInvalid";
  if (!password) fieldErrors.password = "passwordRequired";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };

  const result = await logIn(email, password);
  if (!result.ok && result.status === 429) {
    return {
      formError: "tooManyLogins",
      retryMinutes: retryMinutes(result.retryAfterSeconds),
      values,
    };
  }
  if (!result.ok) {
    return {
      formError:
        result.status === 401 || result.status === 400
          ? "invalidCredentials"
          : "unavailable",
      values,
    };
  }

  await startSession(result.data.token);
  redirect(safeNextPath(formData.get("next")));
}

export async function registerAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const firstName = text(formData, "firstName").trim();
  const lastName = text(formData, "lastName").trim();
  const email = text(formData, "email").trim();
  const password = text(formData, "password");
  const confirmPassword = text(formData, "confirmPassword");
  const values = { firstName, lastName, email };

  const fieldErrors: AuthFormState["fieldErrors"] = {};
  if (!firstName) fieldErrors.firstName = "firstNameRequired";
  else if (firstName.length > MAX_NAME_LENGTH)
    fieldErrors.firstName = "nameTooLong";
  if (!lastName) fieldErrors.lastName = "lastNameRequired";
  else if (lastName.length > MAX_NAME_LENGTH)
    fieldErrors.lastName = "nameTooLong";
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = "emailInvalid";
  if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = "passwordTooShort";
  } else if (confirmPassword !== password) {
    // Typed twice, so a typo does not lock the user out of the new account
    fieldErrors.confirmPassword = "passwordMismatch";
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };

  const created = await apiFetch("/api/auth/register", {
    method: "POST",
    body: { firstName, lastName, email, password },
    auth: false,
  });
  if (!created.ok) {
    if (created.status === 409) {
      return { fieldErrors: { email: "emailTaken" }, values };
    }
    if (created.status === 429) {
      return {
        formError: "tooManyAccounts",
        retryMinutes: retryMinutes(created.retryAfterSeconds),
        values,
      };
    }
    return { formError: "unavailable", values };
  }

  // Log the new user in right away
  const result = await logIn(email, password);
  if (!result.ok) redirect("/login");
  await startSession(result.data.token);
  redirect("/overview");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}

"use server";

import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./config";

// Saves the chosen language. Setting a cookie in a server action makes
// Next render the page again, now in the new language. A logged-in user's
// emails follow the language too, so it is saved on the account as well;
// if that fails, only the emails keep the old language.
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  if (await getSessionToken()) {
    await apiFetch("/api/auth/me/preferences", {
      method: "PATCH",
      body: { language: locale },
    });
  }
}

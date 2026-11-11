"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./config";

// Saves the chosen language. Setting a cookie in a server action makes
// Next render the page again, now in the new language.
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}

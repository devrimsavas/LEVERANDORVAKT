import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  isLocale,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  type Locale,
} from "./config";

// The language is kept in a cookie instead of the URL: a chosen language
// wins, otherwise the browser's language decides.
export async function resolveLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Europe/Oslo",
  };
});

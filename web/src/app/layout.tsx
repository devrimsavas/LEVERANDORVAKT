import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { SkipLink } from "@digdir/designsystemet-react";
// Inter, the font of the Designsystemet theme, installed as a package so the
// app serves it itself and builds never depend on Google Fonts
import "@fontsource-variable/inter";
// Designsystemet: component styles first, then our theme (colors, sizes, typography)
import "@digdir/designsystemet-css";
import "../theme/leverandorvakt.css";
import "./globals.css";
import { COLOR_SCHEME_COOKIE, parseColorScheme } from "@/lib/colorScheme";
import { counterUrl } from "@/lib/analytics";
import { Analytics } from "@/components/Analytics";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("title"), description: t("description") };
}

// The document shell shared by every page. The public pages and the app
// pages each add their own layout inside it: app/(public) and app/(app).
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const t = await getTranslations("header");
  // The saved light/dark choice, or "auto" to follow the operating system
  const colorScheme = parseColorScheme(
    (await cookies()).get(COLOR_SCHEME_COOKIE)?.value,
  );
  const counter = counterUrl();
  // The nonce the proxy made for this request, which the counter's script
  // needs to be allowed to run
  const nonce = (await headers())
    .get("Content-Security-Policy")
    ?.match(/'nonce-([^']+)'/)?.[1];

  return (
    <html lang={locale} data-color-scheme={colorScheme}>
      <body>
        <NextIntlClientProvider>
          <SkipLink href="#main">{t("skipLink")}</SkipLink>
          {children}
        </NextIntlClientProvider>
        {counter && <Analytics url={counter} nonce={nonce} />}
      </body>
    </html>
  );
}

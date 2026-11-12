import type { Metadata } from "next";
import { cookies } from "next/headers";
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

  return (
    <html lang={locale} data-color-scheme={colorScheme}>
      <body>
        <NextIntlClientProvider>
          <SkipLink href="#main">{t("skipLink")}</SkipLink>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

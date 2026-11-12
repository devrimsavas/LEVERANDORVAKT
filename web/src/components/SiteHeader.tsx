import NextLink from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@digdir/designsystemet-react";
import { logoutAction } from "@/lib/authActions";
import { getSessionToken } from "@/lib/session";
import { Logo } from "./Logo";
import { ColorSchemeToggle } from "./ColorSchemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileMenu } from "./MobileMenu";
import styles from "./SiteHeader.module.css";

export async function SiteHeader() {
  const t = await getTranslations("header");
  const locale = await getLocale();
  // Only checks that a session cookie exists; pages that need the user
  // verify the token with the API
  const loggedIn = Boolean(await getSessionToken());

  const links = [
    { href: "/about", text: t("about") },
    { href: "/contact", text: t("contact") },
  ];
  const menuLinks = loggedIn
    ? [...links, { href: "/overview", text: t("overview") }]
    : [
        ...links,
        { href: "/login", text: t("logIn") },
        { href: "/register", text: t("getStarted") },
      ];

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <NextLink href="/" className={styles.home} aria-label={t("home")}>
          <Logo />
        </NextLink>

        <nav className={styles.nav} aria-label={t("menu")}>
          <ul>
            {links.map((link) => (
              <li key={link.href}>
                <NextLink href={link.href}>{link.text}</NextLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          <LanguageSwitcher
            target={locale === "nb" ? "en" : "nb"}
            text={t("switchLanguage")}
            label={t("switchLanguageLabel")}
          />
          <ColorSchemeToggle label={t("colorScheme")} />
          {loggedIn ? (
            <>
              <form action={logoutAction} className={styles.logIn}>
                <Button type="submit" variant="secondary">
                  {t("logOut")}
                </Button>
              </form>
              <Button asChild className={styles.getStarted}>
                <NextLink href="/overview">{t("overview")}</NextLink>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="secondary" className={styles.logIn}>
                <NextLink href="/login">{t("logIn")}</NextLink>
              </Button>
              <Button asChild className={styles.getStarted}>
                <NextLink href="/register">{t("getStarted")}</NextLink>
              </Button>
            </>
          )}
          <MobileMenu
            label={t("menu")}
            links={menuLinks}
            logoutLabel={loggedIn ? t("logOut") : undefined}
          />
        </div>
      </div>
    </header>
  );
}

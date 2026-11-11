import NextLink from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@digdir/designsystemet-react";
import { Logo } from "./Logo";
import { ColorSchemeToggle } from "./ColorSchemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileMenu } from "./MobileMenu";
import styles from "./SiteHeader.module.css";

export async function SiteHeader() {
  const t = await getTranslations("header");
  const locale = await getLocale();

  const links = [
    { href: "/about", text: t("about") },
    { href: "/contact", text: t("contact") },
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
          <Button asChild variant="secondary" className={styles.logIn}>
            <NextLink href="/login">{t("logIn")}</NextLink>
          </Button>
          <Button asChild className={styles.getStarted}>
            <NextLink href="/register">{t("getStarted")}</NextLink>
          </Button>
          <MobileMenu
            label={t("menu")}
            links={[
              ...links,
              { href: "/login", text: t("logIn") },
              { href: "/register", text: t("getStarted") },
            ]}
          />
        </div>
      </div>
    </header>
  );
}

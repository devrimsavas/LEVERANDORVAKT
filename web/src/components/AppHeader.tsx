import NextLink from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getNotificationSummary } from "@/lib/notifications";
import type { CurrentUser } from "@/lib/user";
import { Logo } from "./Logo";
import { AppNav } from "./AppNav";
import { ColorSchemeToggle } from "./ColorSchemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileMenu } from "./MobileMenu";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import styles from "./SiteHeader.module.css";

// The header on pages for logged-in users
export async function AppHeader({ user }: { user: CurrentUser }) {
  const t = await getTranslations("header");
  const app = await getTranslations("app.nav");
  const locale = await getLocale();
  const notifications = await getNotificationSummary();

  const links = [
    { href: "/overview", text: app("overview") },
    { href: "/watchlist", text: app("watchlist") },
    { href: "/search", text: app("search") },
    { href: "/trends", text: app("trends") },
    { href: "/assistant", text: app("assistant") },
    ...(user.role === "admin" ? [{ href: "/admin", text: app("admin") }] : []),
  ];
  const name = `${user.firstName} ${user.lastName}`;

  return (
    <header className={`${styles.header} ${styles.app}`}>
      <div className={`container ${styles.inner}`}>
        <NextLink
          href="/overview"
          className={styles.home}
          aria-label={app("home")}
        >
          <Logo />
        </NextLink>

        <AppNav label={app("label")} links={links} />

        <div className={styles.actions}>
          <LanguageSwitcher
            target={locale === "nb" ? "en" : "nb"}
            text={t("switchLanguage")}
            label={t("switchLanguageLabel")}
          />
          <ColorSchemeToggle label={t("colorScheme")} />
          <NotificationBell initial={notifications} />
          <UserMenu
            name={name}
            email={user.email}
            label={app("account", { name })}
            logoutLabel={t("logOut")}
            guideLabel={t("guide")}
            settingsLabel={t("settings")}
          />
          <MobileMenu
            label={t("menu")}
            links={[
              ...links,
              { href: "/settings", text: t("settings") },
              { href: "/guide", text: t("guide") },
            ]}
            logoutLabel={t("logOut")}
          />
        </div>
      </div>
    </header>
  );
}

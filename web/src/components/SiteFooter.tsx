import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Link, Paragraph } from "@digdir/designsystemet-react";
import { getSessionToken } from "@/lib/session";
import { SITE } from "@/lib/site";
import { Logo } from "./Logo";
import styles from "./SiteFooter.module.css";

const NLOD_URL = "https://data.norge.no/nlod/en/2.0";

export const DATA_SOURCES = [
  { key: "brreg", url: "https://www.brreg.no/" },
  { key: "kartverket", url: "https://www.kartverket.no/" },
  { key: "ssb", url: "https://www.ssb.no/" },
] as const;

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const header = await getTranslations("header");
  const loggedIn = Boolean(await getSessionToken());

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.columns}`}>
        <div className={styles.brand}>
          <Logo />
          <Paragraph data-size="sm">{t("tagline")}</Paragraph>
        </div>

        <nav aria-labelledby="footer-product">
          <h2 id="footer-product" className={styles.heading}>
            {t("product")}
          </h2>
          <ul className={styles.list}>
            <li>
              <Link asChild>
                <NextLink href="/about">{header("about")}</NextLink>
              </Link>
            </li>
            <li>
              <Link asChild>
                <NextLink href="/contact">{header("contact")}</NextLink>
              </Link>
            </li>
            <li>
              <Link asChild>
                {loggedIn ? (
                  <NextLink href="/overview">{header("overview")}</NextLink>
                ) : (
                  <NextLink href="/login">{header("logIn")}</NextLink>
                )}
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-sources">
          <h2 id="footer-sources" className={styles.heading}>
            {t("dataSources")}
          </h2>
          <ul className={styles.list}>
            {DATA_SOURCES.map((source) => (
              <li key={source.key}>
                <Link href={source.url} target="_blank" rel="noreferrer">
                  {t(source.key)}
                  <span className="visually-hidden"> {t("opensInNewTab")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className={`container ${styles.legal}`}>
        <Paragraph data-size="xs">
          <Link href={NLOD_URL} target="_blank" rel="noreferrer">
            {t("license")}
          </Link>{" "}
          {t("independent")}
        </Paragraph>
        <Paragraph data-size="xs">
          © {new Date().getFullYear()} Leverandørvakt ·{" "}
          {SITE.ownerName && (
            <>
              {t("builtBy")}{" "}
              {SITE.portfolioUrl ? (
                <Link href={SITE.portfolioUrl} target="_blank" rel="noreferrer">
                  {SITE.ownerName}
                </Link>
              ) : (
                SITE.ownerName
              )}{" "}
              ·{" "}
            </>
          )}
          <Link href={SITE.repositoryUrl} target="_blank" rel="noreferrer">
            {t("sourceCode")}
          </Link>
        </Paragraph>
      </div>
    </footer>
  );
}

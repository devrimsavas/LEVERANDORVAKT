import type { Metadata } from "next";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Alert,
  Button,
  Heading,
  Link,
  Paragraph,
} from "@digdir/designsystemet-react";
import { DATA_SOURCES } from "@/components/SiteFooter";
import { SITE } from "@/lib/site";
import styles from "@/components/pages.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return { title: `${t("title")} – Leverandørvakt` };
}

const WATCHES = ["roles", "status", "accounts", "risk", "connections"] as const;
const STORED = ["account", "watchlist", "notifications", "notStored"] as const;

export default async function AboutPage() {
  const t = await getTranslations("about");
  const footer = await getTranslations("footer");

  return (
    <article className={`container ${styles.page}`}>
      <header className={styles.intro}>
        <Heading level={1} data-size="xl">
          {t("title")}
        </Heading>
        <Paragraph data-size="lg" className={styles.lead}>
          {t("lead")}
        </Paragraph>
      </header>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("why.title")}
        </Heading>
        <Paragraph>{t("why.text1")}</Paragraph>
        <Paragraph>{t("why.text2")}</Paragraph>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("watches.title")}
        </Heading>
        <ul className={styles.list}>
          {WATCHES.map((key) => (
            <li key={key}>
              <strong>{t(`watches.${key}.title`)}</strong>{" "}
              {t(`watches.${key}.text`)}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("data.title")}
        </Heading>
        <Paragraph>{t("data.text")}</Paragraph>
        <ul className={styles.list}>
          {DATA_SOURCES.map((source) => (
            <li key={source.key}>
              <Link href={source.url} target="_blank" rel="noreferrer">
                {footer(source.key)}
              </Link>{" "}
              – {t(`data.${source.key}`)}
            </li>
          ))}
        </ul>
        <Paragraph data-size="sm" className={styles.muted}>
          {footer("license")}
        </Paragraph>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("risk.title")}
        </Heading>
        <Paragraph>{t("risk.text1")}</Paragraph>
        <Alert data-color="info">{t("risk.limits")}</Alert>
      </section>

      <section className={styles.section}>
        <Heading level={2} data-size="md">
          {t("privacy.title")}
        </Heading>
        <ul className={styles.list}>
          {STORED.map((key) => (
            <li key={key}>{t(`privacy.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section className={`${styles.section} ${styles.project}`}>
        <Heading level={2} data-size="md">
          {t("project.title")}
        </Heading>
        <Paragraph>
          {SITE.ownerName
            ? t("project.byName", { name: SITE.ownerName })
            : t("project.text")}
        </Paragraph>
        <Paragraph>{t("project.built")}</Paragraph>
        <Paragraph>{t("project.independent")}</Paragraph>
        <div className={styles.actions}>
          <Button asChild variant="secondary">
            <a href={SITE.repositoryUrl} target="_blank" rel="noreferrer">
              {t("project.source")}
            </a>
          </Button>
          <Button asChild variant="tertiary">
            <NextLink href="/contact">{t("project.contact")}</NextLink>
          </Button>
        </div>
      </section>
    </article>
  );
}

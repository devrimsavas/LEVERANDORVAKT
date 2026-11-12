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
import styles from "@/components/pages.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guide");
  return { title: `${t("title")} – Leverandørvakt`, description: t("lead") };
}

// The sections of the guide, in order; each has a title, a text and,
// where listed here, a list of points
const SECTIONS = {
  start: ["search", "follow", "note"],
  watched: ["status", "roles", "details", "accounts"],
  risk: ["level", "score", "signals", "limits"],
  notifications: ["critical", "warning", "info"],
  accounts: [],
  trends: [],
  assistant: ["ask", "sources", "private", "limit"],
} as const;
type Section = keyof typeof SECTIONS;

const SCENARIOS = [
  "bankrupt",
  "newCeo",
  "lateAccounts",
  "newCustomer",
] as const;

// How to use Leverandørvakt, with examples of what you see when something
// happens. Public, so it can be read before creating an account.
export default async function GuidePage() {
  const t = await getTranslations("guide");
  const sections = Object.keys(SECTIONS) as Section[];

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

      <nav aria-labelledby="guide-contents" className={styles.contents}>
        <Heading id="guide-contents" level={2} data-size="xs">
          {t("contents")}
        </Heading>
        <ol>
          {sections.map((key) => (
            <li key={key}>
              <Link href={`#${key}`}>{t(`${key}.title`)}</Link>
            </li>
          ))}
          <li>
            <Link href="#scenarios">{t("scenarios.title")}</Link>
          </li>
        </ol>
      </nav>

      {sections.map((key) => (
        <section key={key} id={key} className={styles.section}>
          <Heading level={2} data-size="md">
            {t(`${key}.title`)}
          </Heading>
          <Paragraph>{t(`${key}.text`)}</Paragraph>
          {SECTIONS[key].length > 0 && (
            <ul className={styles.list}>
              {SECTIONS[key].map((point) => (
                <li key={point}>
                  <strong>
                    {t(
                      `${key}.points.${point}.title` as "start.points.search.title",
                    )}
                  </strong>{" "}
                  {t(
                    `${key}.points.${point}.text` as "start.points.search.text",
                  )}
                </li>
              ))}
            </ul>
          )}
          {key === "risk" && (
            <Alert data-color="info">{t("risk.notCredit")}</Alert>
          )}
        </section>
      ))}

      <section id="scenarios" className={styles.section}>
        <Heading level={2} data-size="md">
          {t("scenarios.title")}
        </Heading>
        <Paragraph>{t("scenarios.text")}</Paragraph>
        <div className={styles.scenarios}>
          {SCENARIOS.map((key) => (
            <section
              key={key}
              className={styles.scenario}
              aria-labelledby={`scenario-${key}`}
            >
              <Heading id={`scenario-${key}`} level={3} data-size="xs">
                {t(`scenarios.${key}.title`)}
              </Heading>
              <dl>
                <dt>{t("scenarios.happens")}</dt>
                <dd>{t(`scenarios.${key}.happens`)}</dd>
                <dt>{t("scenarios.see")}</dt>
                <dd>{t(`scenarios.${key}.see`)}</dd>
                <dt>{t("scenarios.do")}</dt>
                <dd>{t(`scenarios.${key}.do`)}</dd>
              </dl>
            </section>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.project}`}>
        <Heading level={2} data-size="md">
          {t("more.title")}
        </Heading>
        <Paragraph>{t("more.text")}</Paragraph>
        <div className={styles.actions}>
          <Button asChild>
            <NextLink href="/overview">{t("more.start")}</NextLink>
          </Button>
          <Button asChild variant="tertiary">
            <NextLink href="/about">{t("more.about")}</NextLink>
          </Button>
        </div>
      </section>
    </article>
  );
}

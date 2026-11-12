import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Heading, Paragraph } from "@digdir/designsystemet-react";
import {
  EnvelopeClosedIcon,
  PersonCircleIcon,
  BranchingIcon,
  GlobeIcon,
} from "@navikt/aksel-icons";
import { SITE } from "@/lib/site";
import styles from "@/components/pages.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contact");
  return { title: `${t("title")} – Leverandørvakt` };
}

// Ways to get in touch. Only the details filled in in lib/site.ts are shown.
export default async function ContactPage() {
  const t = await getTranslations("contact");

  const channels = [
    SITE.contactEmail && {
      key: "email",
      Icon: EnvelopeClosedIcon,
      href: `mailto:${SITE.contactEmail}`,
      text: SITE.contactEmail,
    },
    SITE.linkedInUrl && {
      key: "linkedin",
      Icon: PersonCircleIcon,
      href: SITE.linkedInUrl,
      text: t("linkedinText"),
    },
    SITE.portfolioUrl && {
      key: "portfolio",
      Icon: GlobeIcon,
      href: SITE.portfolioUrl,
      text: SITE.portfolioUrl.replace(/^https?:\/\//, ""),
    },
    {
      key: "github",
      Icon: BranchingIcon,
      href: SITE.repositoryUrl,
      text: t("githubText"),
    },
  ].filter(Boolean) as {
    key: "email" | "linkedin" | "portfolio" | "github";
    Icon: typeof GlobeIcon;
    href: string;
    text: string;
  }[];

  return (
    <article className={`container ${styles.page}`}>
      <header className={styles.intro}>
        <Heading level={1} data-size="xl">
          {t("title")}
        </Heading>
        <Paragraph data-size="lg" className={styles.lead}>
          {SITE.ownerName ? t("leadName", { name: SITE.ownerName }) : t("lead")}
        </Paragraph>
      </header>

      <ul className={styles.channels}>
        {channels.map(({ key, Icon, href, text }) => (
          <li key={key}>
            <a
              href={href}
              className={styles.channel}
              {...(key === "email"
                ? {}
                : { target: "_blank", rel: "noreferrer" })}
            >
              <span className={styles.channelIcon}>
                <Icon aria-hidden />
              </span>
              <span>
                <span className={styles.channelLabel}>
                  {t(`channels.${key}`)}
                </span>
                <span className={styles.channelText}>{text}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      <section className={styles.section}>
        <Heading level={2} data-size="sm">
          {t("about.title")}
        </Heading>
        <Paragraph>{t("about.text")}</Paragraph>
      </section>
    </article>
  );
}

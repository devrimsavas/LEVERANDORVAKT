import type { Metadata } from "next";
import NextLink from "next/link";
import { getFormatter, getNow, getTranslations } from "next-intl/server";
import {
  Alert,
  Heading,
  Link,
  Paragraph,
  Tag,
} from "@digdir/designsystemet-react";
import { getWatchlist } from "@/lib/companies";
import { getNotificationSummary } from "@/lib/notifications";
import { changeTitleKey } from "@/lib/changeTitle";
import { SEVERITY_COLOR } from "@/lib/notificationTypes";
import { formatOrgNumber } from "@/lib/orgNumber";
import { requireUser } from "@/lib/user";
import { RiskTag } from "@/components/company/RiskTag";
import { getOnboarding } from "@/lib/onboarding";
import { GettingStarted } from "@/components/overview/GettingStarted";
import { RiskSplit, countRiskLevels } from "@/components/overview/RiskSplit";
import styles from "@/components/overview/overview.module.css";

const ATTENTION_LIMIT = 5;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.nav");
  return { title: `${t("overview")} – Leverandørvakt` };
}

// The first page after logging in: what needs attention today
export default async function OverviewPage() {
  const user = await requireUser();
  const t = await getTranslations("overview");
  const changes = await getTranslations("changes");
  const severity = await getTranslations("notifications.severity");
  const format = await getFormatter();
  const now = await getNow();
  const [watchlist, notifications, onboarding] = await Promise.all([
    getWatchlist("risk"),
    getNotificationSummary(),
    getOnboarding(),
  ]);

  const heading = (
    <Heading level={1} data-size="lg">
      {t("welcome", { name: user.firstName })}
    </Heading>
  );

  if (watchlist.status !== "ok") {
    return (
      <div className={`container ${styles.page}`}>
        {heading}
        <Alert data-color="warning">{t("unavailable")}</Alert>
      </div>
    );
  }

  const rows = watchlist.data;

  // Without the API's answer, the steps are read from the watchlist alone
  const steps = onboarding?.steps ?? {
    followCompany: rows.length > 0,
    writeNote: rows.some((row) => row.note),
    askAssistant: false,
  };
  const firstCompany = rows[0]
    ? { orgNumber: rows[0].orgNumber, name: rows[0].name }
    : null;

  // A new user: show how to get started instead of empty boxes
  if (rows.length === 0) {
    return (
      <div className={`container ${styles.page}`}>
        {heading}
        <GettingStarted steps={steps} firstCompany={null} canClose={false} />
      </div>
    );
  }

  const attention = rows
    .filter((row) => row.risk.level === "high" || row.risk.level === "medium")
    .slice(0, ATTENTION_LIMIT);
  const unread = notifications?.unreadCount ?? null;

  return (
    <div className={`container ${styles.page}`}>
      {heading}

      {onboarding && onboarding.dismissedAt === null && (
        <GettingStarted steps={steps} firstCompany={firstCompany} canClose />
      )}

      <ul className={styles.tiles}>
        <li className={styles.tile}>
          <span className={styles.tileLabel}>{t("tiles.followed")}</span>
          <span className={styles.tileValue}>{format.number(rows.length)}</span>
        </li>
        <li className={styles.tile}>
          <span className={styles.tileLabel}>{t("tiles.attention")}</span>
          <span className={styles.tileValue}>
            {format.number(
              rows.filter(
                (r) => r.risk.level === "high" || r.risk.level === "medium",
              ).length,
            )}
          </span>
        </li>
        <li className={styles.tile}>
          <span className={styles.tileLabel}>{t("tiles.unread")}</span>
          <span className={styles.tileValue}>
            {unread === null ? "–" : format.number(unread)}
          </span>
        </li>
      </ul>

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="attention">
          <Heading id="attention" level={2} data-size="xs">
            {t("attention.title")}
          </Heading>
          {attention.length === 0 ? (
            <Paragraph>{t("attention.none")}</Paragraph>
          ) : (
            <ul className={styles.rows}>
              {attention.map((row) => (
                <li key={row.orgNumber}>
                  <NextLink
                    href={`/companies/${row.orgNumber}?tab=risk`}
                    className={styles.row}
                  >
                    <span className={styles.rowMain}>
                      <span className={styles.rowName}>{row.name}</span>
                      <span className={styles.rowMeta}>
                        {formatOrgNumber(row.orgNumber)}
                      </span>
                    </span>
                    <RiskTag level={row.risk.level} />
                  </NextLink>
                </li>
              ))}
            </ul>
          )}
        </section>

        <RiskSplit
          id="risk-split"
          title={t("risk.title")}
          counts={countRiskLevels(rows)}
          link={{ href: "/watchlist?sort=risk", text: t("risk.link") }}
        />

        <section
          className={`${styles.card} ${styles.wide}`}
          aria-labelledby="latest"
        >
          <Heading id="latest" level={2} data-size="xs">
            {t("latest.title")}
          </Heading>
          {notifications === null ? (
            <Paragraph>{t("latest.unavailable")}</Paragraph>
          ) : notifications.latest.length === 0 ? (
            <Paragraph>{t("latest.none")}</Paragraph>
          ) : (
            <ul className={styles.rows}>
              {notifications.latest.map((item) => {
                const key = changeTitleKey(
                  item.change.field,
                  item.change.newValue,
                );
                return (
                  <li key={item.id}>
                    <NextLink
                      href={`/companies/${item.company.orgNumber}?tab=changes`}
                      className={styles.row}
                      data-unread={item.readAt === null || undefined}
                    >
                      <span className={styles.tagColumn}>
                        <Tag
                          data-color={SEVERITY_COLOR[item.change.severity]}
                          data-size="sm"
                        >
                          {severity(item.change.severity)}
                        </Tag>
                      </span>
                      <span className={styles.rowMain}>
                        <span className={styles.rowName}>
                          {item.company.name}
                        </span>
                        <span className={styles.rowMeta}>
                          {changes.has(key) ? changes(key) : changes("other")}
                        </span>
                      </span>
                      <span className={styles.rowTime}>
                        {format.relativeTime(new Date(item.createdAt), now)}
                      </span>
                    </NextLink>
                  </li>
                );
              })}
            </ul>
          )}
          <Link asChild data-size="sm">
            <NextLink href="/notifications">{t("latest.link")}</NextLink>
          </Link>
        </section>
      </div>
    </div>
  );
}

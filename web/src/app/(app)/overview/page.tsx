import type { Metadata } from "next";
import NextLink from "next/link";
import { getFormatter, getNow, getTranslations } from "next-intl/server";
import {
  Alert,
  Button,
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
import { RiskSplit } from "@/components/overview/RiskSplit";
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
  const [watchlist, notifications] = await Promise.all([
    getWatchlist("risk"),
    getNotificationSummary(),
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

  // A new user: show how to get started instead of empty boxes
  if (rows.length === 0) {
    return (
      <div className={`container ${styles.page}`}>
        {heading}
        <section className={styles.welcome} aria-labelledby="get-started">
          <Heading id="get-started" level={2} data-size="md">
            {t("start.title")}
          </Heading>
          <Paragraph>{t("start.lead")}</Paragraph>
          <ol className={styles.startSteps}>
            {(["search", "follow", "notified"] as const).map((step, index) => (
              <li key={step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <span>
                  <strong>{t(`start.${step}.title`)}</strong>
                  <br />
                  {t(`start.${step}.text`)}
                </span>
              </li>
            ))}
          </ol>
          <Button asChild data-size="lg">
            <NextLink href="/search">{t("start.button")}</NextLink>
          </Button>
        </section>
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

        <RiskSplit rows={rows} />

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

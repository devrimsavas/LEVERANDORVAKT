import type { Metadata } from "next";
import NextLink from "next/link";
import { getFormatter, getNow, getTranslations } from "next-intl/server";
import {
  Alert,
  Button,
  Heading,
  Paragraph,
  Tag,
} from "@digdir/designsystemet-react";
import { ArrowRightIcon } from "@navikt/aksel-icons";
import { changeTitleKey } from "@/lib/changeTitle";
import { getChangeDisplay } from "@/lib/changeDisplay";
import { getNotifications, getNotificationSummary } from "@/lib/notifications";
import { SEVERITY_COLOR } from "@/lib/notificationTypes";
import { formatOrgNumber } from "@/lib/orgNumber";
import { MarkReadButton } from "@/components/notifications/MarkReadButton";
import styles from "@/components/notifications/notifications.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.nav");
  return { title: `${t("notifications")} – Leverandørvakt` };
}

// Every notification, newest first, 20 per page; "unread" shows only the
// ones not read yet. Filter and page are in the URL.
export default async function NotificationsPage({
  searchParams,
}: PageProps<"/notifications">) {
  const t = await getTranslations("notificationsPage");
  const changes = await getTranslations("changes");
  const severity = await getTranslations("notifications.severity");
  const format = await getFormatter();
  const now = await getNow();
  const query = await searchParams;
  const unreadOnly = query.filter === "unread";
  const page = Math.max(1, Number(query.page) || 1);

  const [list, summary] = await Promise.all([
    getNotifications(page, unreadOnly),
    getNotificationSummary(),
  ]);
  const unread = summary?.unreadCount ?? 0;
  const link = (target: { filter?: boolean; page?: number }) => {
    const params = new URLSearchParams();
    if (target.filter ?? unreadOnly) params.set("filter", "unread");
    if (target.page && target.page > 1) params.set("page", String(target.page));
    const q = params.toString();
    return `/notifications${q ? `?${q}` : ""}`;
  };
  const display = await getChangeDisplay();

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.top}>
        <div>
          <Heading level={1} data-size="lg">
            {t("title")}
          </Heading>
          <Paragraph className={styles.sub}>
            {unread > 0 ? t("unreadCount", { count: unread }) : t("allRead")}
          </Paragraph>
        </div>
        {unread > 0 && <MarkReadButton label={t("markAllRead")} />}
      </div>

      <nav aria-label={t("filterLabel")} className={styles.filter}>
        <NextLink
          href={link({ filter: false })}
          aria-current={!unreadOnly ? "true" : undefined}
        >
          {t("filters.all")}
        </NextLink>
        <NextLink
          href={link({ filter: true })}
          aria-current={unreadOnly ? "true" : undefined}
        >
          {t("filters.unread")}
          {unread > 0 && <span className={styles.count}>{unread}</span>}
        </NextLink>
      </nav>

      {list === null ? (
        <Alert data-color="warning">{t("unavailable")}</Alert>
      ) : list.items.length === 0 ? (
        <div className={styles.empty}>
          <Paragraph>{unreadOnly ? t("emptyUnread") : t("empty")}</Paragraph>
          {!unreadOnly && (
            <Button asChild variant="secondary">
              <NextLink href="/search">{t("findCompany")}</NextLink>
            </Button>
          )}
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {list.items.map((item) => {
              const key = changeTitleKey(
                item.change.field,
                item.change.newValue,
              );
              const isUnread = item.readAt === null;
              const { before, after } = display(
                item.change.field,
                item.change.oldValue,
                item.change.newValue,
              );
              return (
                <li
                  key={item.id}
                  className={styles.item}
                  data-unread={isUnread || undefined}
                >
                  <span className={styles.tagColumn}>
                    <Tag
                      data-color={SEVERITY_COLOR[item.change.severity]}
                      data-size="sm"
                    >
                      {severity(item.change.severity)}
                    </Tag>
                  </span>
                  <div className={styles.body}>
                    <NextLink
                      href={`/companies/${item.company.orgNumber}?tab=changes`}
                      className={styles.company}
                    >
                      {item.company.name}
                    </NextLink>
                    <span className={styles.meta}>
                      {formatOrgNumber(item.company.orgNumber)}
                    </span>
                    <span className={styles.what}>
                      {changes.has(key) ? changes(key) : changes("other")}
                    </span>
                    {(before !== "–" || after !== "–") && (
                      <span className={styles.values}>
                        <span>{before}</span>
                        <ArrowRightIcon aria-label={t("changedTo")} />
                        <span>{after}</span>
                      </span>
                    )}
                  </div>
                  <div className={styles.side}>
                    <time
                      dateTime={item.createdAt}
                      title={format.dateTime(new Date(item.createdAt), {
                        dateStyle: "long",
                        timeStyle: "short",
                      })}
                    >
                      {format.relativeTime(new Date(item.createdAt), now)}
                    </time>
                    {isUnread ? (
                      <>
                        <span className="visually-hidden">{t("unread")}</span>
                        <MarkReadButton id={item.id} label={t("markRead")} />
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {list.totalPages > 1 && (
            <nav aria-label={t("pages")} className={styles.pager}>
              {page > 1 && (
                <Button asChild variant="secondary" data-size="sm">
                  <NextLink href={link({ page: page - 1 })}>
                    {t("newer")}
                  </NextLink>
                </Button>
              )}
              <span>{t("pageOf", { page, total: list.totalPages })}</span>
              {page < list.totalPages && (
                <Button asChild variant="secondary" data-size="sm">
                  <NextLink href={link({ page: page + 1 })}>
                    {t("older")}
                  </NextLink>
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

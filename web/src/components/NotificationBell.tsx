"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Paragraph,
  Popover,
  Tag,
} from "@digdir/designsystemet-react";
import { BellIcon } from "@navikt/aksel-icons";
import { changeTitleKey } from "@/lib/changeTitle";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notificationActions";
import {
  SEVERITY_COLOR,
  type NotificationSummary,
} from "@/lib/notificationTypes";
import styles from "./NotificationBell.module.css";

// The API is checked once a minute while the page is visible. Brreg is
// checked every ten minutes, so this is quick enough without a live
// connection.
const REFRESH_MS = 60_000;

export function NotificationBell({
  initial,
}: {
  initial: NotificationSummary | null;
}) {
  const t = useTranslations("notifications");
  const changes = useTranslations("changes");
  const format = useFormatter();
  const now = useNow({ updateInterval: REFRESH_MS });
  const router = useRouter();
  const pathname = usePathname();
  const [summary, setSummary] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (response.ok)
        setSummary((await response.json()) as NotificationSummary);
    } catch {
      // Keep showing the last known state; the next check tries again
    }
  }, []);

  // Check every minute while the tab is visible, and as soon as the user
  // comes back to the tab
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const unread = summary?.unreadCount ?? 0;

  function changeTitle(field: string, newValue: unknown) {
    const key = changeTitleKey(field, newValue);
    return changes.has(key) ? changes(key) : changes("other");
  }

  // "(3) Leverandørvakt" in the browser tab, like social media sites. Next
  // sets each page's title itself, sometimes after this component has
  // rendered, so the prefix is added again whenever the title changes.
  useEffect(() => {
    const prefix = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ` : "";
    const apply = () => {
      const wanted = prefix + document.title.replace(/^\(\d+\+?\) /, "");
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [unread, pathname]);

  function openNotification(id: string, orgNumber: string) {
    setOpen(false);
    startTransition(async () => {
      await markNotificationRead(id);
      await refresh();
      router.push(`/companies/${orgNumber}`);
    });
  }

  function readAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      await refresh();
    });
  }

  const label =
    unread > 0 ? t("bellLabelUnread", { count: unread }) : t("bellLabel");

  return (
    <>
      <Button
        variant="tertiary"
        icon
        aria-label={label}
        title={label}
        popoverTarget="notification-panel"
      >
        <Badge.Position placement="top-right" overlap="circle">
          {unread > 0 && (
            <Badge data-color="danger" count={unread} maxCount={9} />
          )}
          <BellIcon aria-hidden />
        </Badge.Position>
      </Button>
      <Popover
        id="notification-panel"
        placement="bottom-end"
        open={open}
        onOpen={() => {
          setOpen(true);
          void refresh();
        }}
        onClose={() => setOpen(false)}
        className={styles.panel}
      >
        <div className={styles.head}>
          <h2 className={styles.title}>{t("title")}</h2>
          {unread > 0 && (
            <Button
              variant="tertiary"
              data-size="sm"
              onClick={readAll}
              disabled={pending}
            >
              {t("markAllRead")}
            </Button>
          )}
        </div>

        {summary === null ? (
          <Paragraph data-size="sm">{t("unavailable")}</Paragraph>
        ) : summary.latest.length === 0 ? (
          <Paragraph data-size="sm">{t("empty")}</Paragraph>
        ) : (
          <ul className={styles.list}>
            {summary.latest.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.item}
                  data-unread={item.readAt === null || undefined}
                  onClick={() =>
                    openNotification(item.id, item.company.orgNumber)
                  }
                >
                  <Tag
                    data-color={SEVERITY_COLOR[item.change.severity]}
                    data-size="sm"
                  >
                    {t(`severity.${item.change.severity}`)}
                  </Tag>
                  <span className={styles.text}>
                    <span className={styles.company}>{item.company.name}</span>
                    <span>
                      {changeTitle(item.change.field, item.change.newValue)}
                    </span>
                  </span>
                  <span className={styles.time}>
                    {format.relativeTime(new Date(item.createdAt), now)}
                  </span>
                  {item.readAt === null && (
                    <span className="visually-hidden">{t("unread")}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <NextLink
          href="/notifications"
          className={styles.all}
          onClick={() => setOpen(false)}
        >
          {t("seeAll")}
        </NextLink>
      </Popover>
    </>
  );
}

import "server-only";
import { cache } from "react";
import { apiFetch } from "./api";
import type {
  NotificationItem,
  NotificationSummary,
} from "./notificationTypes";

const LATEST_COUNT = 5;

// The unread count and the latest notifications, for the bell in the header
// and the overview page; cache asks the API once per request.
// null when the API did not answer.
export const getNotificationSummary = cache(
  async (): Promise<NotificationSummary | null> => {
    const [count, latest] = await Promise.all([
      apiFetch<{ count: number }>("/api/notifications/unread-count"),
      apiFetch<{ items: NotificationItem[] }>(
        `/api/notifications?page=1&pageSize=${LATEST_COUNT}`,
      ),
    ]);
    if (!count.ok || !latest.ok) return null;
    return { unreadCount: count.data.count, latest: latest.data.items };
  },
);

export const NOTIFICATIONS_PAGE_SIZE = 20;

export interface NotificationPage {
  items: NotificationItem[];
  page: number;
  totalItems: number;
  totalPages: number;
}

export async function getNotifications(
  page: number,
  unreadOnly: boolean,
): Promise<NotificationPage | null> {
  const result = await apiFetch<NotificationPage>(
    `/api/notifications?page=${page}&pageSize=${NOTIFICATIONS_PAGE_SIZE}${unreadOnly ? "&unread=true" : ""}`,
  );
  return result.ok ? result.data : null;
}

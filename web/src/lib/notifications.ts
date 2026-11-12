import "server-only";
import { apiFetch } from "./api";
import type {
  NotificationItem,
  NotificationSummary,
} from "./notificationTypes";

const LATEST_COUNT = 5;

// The unread count and the latest notifications, for the bell in the header.
// null when the API did not answer.
export async function getNotificationSummary(): Promise<NotificationSummary | null> {
  const [count, latest] = await Promise.all([
    apiFetch<{ count: number }>("/api/notifications/unread-count"),
    apiFetch<{ items: NotificationItem[] }>(
      `/api/notifications?page=1&pageSize=${LATEST_COUNT}`,
    ),
  ]);
  if (!count.ok || !latest.ok) return null;
  return { unreadCount: count.data.count, latest: latest.data.items };
}

"use server";

import { apiFetch } from "./api";

const UUID = /^[0-9a-f-]{36}$/i;

export async function markNotificationRead(id: string): Promise<void> {
  if (!UUID.test(id)) return;
  await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/api/notifications/read-all", { method: "POST" });
}

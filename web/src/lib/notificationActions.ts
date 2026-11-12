"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "./api";

const UUID = /^[0-9a-f-]{36}$/i;

// After a change the pages render again: the layout's bell count, the
// overview and the notifications page all show read state
function refreshPages() {
  revalidatePath("/", "layout");
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!UUID.test(id)) return;
  await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
  refreshPages();
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/api/notifications/read-all", { method: "POST" });
  refreshPages();
}

import "server-only";
import { apiFetch } from "./api";
import {
  MAX_USER_SEARCH_LENGTH,
  USERS_PAGE_SIZE,
  type AdminUserPage,
  type SystemStatus,
} from "./adminTypes";

// null when the API did not answer
export async function getSystemStatus(): Promise<SystemStatus | null> {
  const result = await apiFetch<SystemStatus>("/api/admin/status");
  return result.ok ? result.data : null;
}

export async function getUsers(
  page: number,
  search: string,
): Promise<AdminUserPage | null> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(USERS_PAGE_SIZE),
  });
  const q = search.trim().slice(0, MAX_USER_SEARCH_LENGTH);
  if (q !== "") params.set("q", q);
  const result = await apiFetch<AdminUserPage>(`/api/admin/users?${params}`);
  return result.ok ? result.data : null;
}

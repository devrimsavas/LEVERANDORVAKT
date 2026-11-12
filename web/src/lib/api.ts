import "server-only";
import { getSessionToken } from "./session";

// Calls the Leverandørvakt API from the Next server. The browser never talks
// to the API directly, so its address is a server-only setting.
const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  // Send the logged-in user's token (default true)
  auth?: boolean;
}

// status 0 means the API could not be reached at all
export async function apiFetch<T>(
  path: string,
  { method = "GET", body, auth = true }: ApiOptions = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = await getSessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: "The API could not be reached" };
  }

  const data: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const error =
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : response.statusText;
    return { ok: false, status: response.status, error };
  }
  return { ok: true, status: response.status, data: data as T };
}

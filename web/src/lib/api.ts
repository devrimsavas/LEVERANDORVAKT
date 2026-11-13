import "server-only";
import { isIP } from "node:net";
import { headers as requestHeaders } from "next/headers";
import { getSessionToken } from "./session";

// Calls the Leverandørvakt API from the Next server. The browser never talks
// to the API directly, so its address is a server-only setting.
const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false;
      status: number;
      error: string;
      // With 429: how long until the API accepts the request again
      retryAfterSeconds?: number;
    };

// The address of the visitor's browser, sent on to the API, which limits
// login attempts and new accounts per address. Without it every visitor
// would look like the web app's server. CLIENT_IP_HEADER names the header
// a hosting platform puts it in (x-real-ip on Vercel, cf-connecting-ip
// behind Cloudflare); by default the first address in X-Forwarded-For.
async function clientAddress(): Promise<string | null> {
  try {
    const name = process.env.CLIENT_IP_HEADER || "x-forwarded-for";
    const value = (await requestHeaders()).get(name)?.split(",")[0]?.trim();
    return value && isIP(value) ? value : null;
  } catch {
    // Called outside a request (no headers to read)
    return null;
  }
}

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
  const address = await clientAddress();
  if (address) headers["X-Forwarded-For"] = address;

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
    const retryAfterSeconds =
      data &&
      typeof data === "object" &&
      "retryAfterSeconds" in data &&
      typeof data.retryAfterSeconds === "number"
        ? data.retryAfterSeconds
        : undefined;
    return { ok: false, status: response.status, error, retryAfterSeconds };
  }
  return { ok: true, status: response.status, data: data as T };
}

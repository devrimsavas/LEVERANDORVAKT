import { NextResponse, type NextRequest } from "next/server";

// Runs before every page request. It only looks at the session cookie (no
// API call), so it is fast; the API still checks the token on every call.
const SESSION_COOKIE = "session";

// Pages that need a login
const PROTECTED = [
  "/overview",
  "/watchlist",
  "/companies",
  "/search",
  "/trends",
  "/assistant",
  "/notifications",
  "/admin",
  "/settings",
];

// Pages a logged-in user has no reason to see
const GUEST_ONLY = ["/login", "/register"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isExpired(token: string): boolean {
  try {
    const payload = token.split(".")[1] ?? "";
    const { exp } = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    return typeof exp !== "number" || exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const loggedIn = Boolean(token) && !isExpired(token!);

  if (!loggedIn && matches(pathname, PROTECTED)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    const response = NextResponse.redirect(url);
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (loggedIn && matches(pathname, GUEST_ONLY)) {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next's own files and static assets
  matcher: ["/((?!_next/|favicon.ico|.*\\.[a-z0-9]+$).*)"],
};

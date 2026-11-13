import { NextResponse, type NextRequest } from "next/server";

// Runs before every page request. It sends visitors to the login page and
// back by the session cookie alone (no API call, so it is fast; the API
// still checks the token on every call), and gives each page its content
// security policy.
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

// The content security policy: which sources the browser may load scripts,
// styles, images and so on from. Scripts need a nonce, a random value made
// for each request, which Next.js puts on its own script tags; a script
// slipped into the page without it does not run. Styles allow inline
// style attributes, which the charts and the design system use.
function contentSecurityPolicy(nonce: string): string {
  const development = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // React's development tools need eval; never in production
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function withSecurityPolicy(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce);
  // Next.js reads the nonce from the request's policy header
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
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

  return withSecurityPolicy(request);
}

export const config = {
  // Skip Next's own files and static assets
  matcher: ["/((?!_next/|favicon.ico|.*\\.[a-z0-9]+$).*)"],
};

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Loads the translations for each request from src/i18n/request.ts
const withNextIntl = createNextIntlPlugin();

// Security headers for every response. The content security policy is
// set per request in src/proxy.ts, since it holds a new nonce each time.
const SECURITY_HEADERS = [
  // Never guess a file's type from its content
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never show the app inside a frame on another site (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Send only the site, not the full address, to other sites
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses none of these browser features
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Only HTTPS for two years, once the site has been visited over HTTPS
  // (browsers ignore it over plain http://localhost)
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Do not tell that the site is built with Next.js
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // The Docker image sets NEXT_OUTPUT=standalone: the build then makes a
  // small self-contained server in .next/standalone. Other builds (npm run
  // build, Vercel) are not changed.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone" as const }
    : {}),
};

export default withNextIntl(nextConfig);

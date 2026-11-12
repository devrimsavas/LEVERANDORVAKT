import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Loads the translations for each request from src/i18n/request.ts
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // The Docker image sets NEXT_OUTPUT=standalone: the build then makes a
  // small self-contained server in .next/standalone. Other builds (npm run
  // build, Vercel) are not changed.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone" as const }
    : {}),
};

export default withNextIntl(nextConfig);

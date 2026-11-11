import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Loads the translations for each request from src/i18n/request.ts
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);

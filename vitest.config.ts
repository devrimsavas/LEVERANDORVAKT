import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Tests use their own database and settings from .env.test,
// never the development database in .env
const testEnv = config({ path: ".env.test", quiet: true }).parsed ?? {};

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The rate limits are set out of reach, so tests can register and log in
    // as often as they need; tests/security.test.ts sets low ones itself
    env: {
      ...testEnv,
      REGISTRATIONS_PER_ADDRESS: "100000",
      LOGIN_FAILURES_PER_ACCOUNT: "100000",
      LOGIN_FAILURES_PER_ADDRESS: "100000",
      REQUESTS_PER_ADDRESS: "1000000",
      PASSWORD_RESETS_PER_ACCOUNT: "100000",
      PASSWORD_RESETS_PER_ADDRESS: "100000",
      PASSWORD_CHECK_FAILURES_PER_ACCOUNT: "100000",
    },
    globalSetup: ["tests/helpers/globalSetup.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    // All test files share one database, so they must not run at the same time
    fileParallelism: false,
  },
});

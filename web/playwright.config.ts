import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { API_PORT, CONTROL_PORT, WEB_PORT } from "./e2e/settings";

// End-to-end tests: a real browser against the real web app and API.
// The API runs in end-to-end mode (tests/e2e/fakeServices.ts in the repo
// root): a fresh database for every run and fake Brreg, Kartverket, SSB
// and language model, so the tests never reach the network.
//   npm run e2e           run the tests
//   npm run e2e:report    open the report of the last run
// Other ports than `npm run dev`, so both can run at the same time.

const CI = Boolean(process.env.CI);

// The database the API uses; dropped and created again on every run.
// E2E_DATABASE_URL wins; otherwise the connection in the repo root's
// .env.test is used with the database name leverandorvakt_e2e.
function e2eDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  try {
    const envTest = readFileSync("../.env.test", "utf8");
    const match = envTest.match(/^DATABASE_URL=(.+)$/m);
    if (match) {
      const url = new URL(match[1]!.trim().replace(/^["']|["']$/g, ""));
      url.pathname = "/leverandorvakt_e2e";
      return url.toString();
    }
  } catch {
    // No .env.test: the default in tests/e2e/e2e.env is used
  }
  return "postgres://postgres:postgres@localhost:5432/leverandorvakt_e2e";
}

export default defineConfig({
  testDir: "./e2e",
  // The tests share one API and its background jobs, so they run one at a time
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "en-GB",
    timezoneId: "Europe/Oslo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /phone\.spec\.ts/,
    },
    {
      name: "phone",
      use: { ...devices["Pixel 7"] },
      testMatch: /phone\.spec\.ts/,
    },
  ],
  webServer: [
    {
      // Builds the API and starts it in end-to-end mode
      command: "npm run build && npm run e2e:api",
      cwd: "..",
      url: `http://localhost:${API_PORT}/`,
      env: {
        DOTENV_CONFIG_PATH: "tests/e2e/e2e.env",
        DATABASE_URL: e2eDatabaseUrl(),
        PORT: String(API_PORT),
        E2E_CONTROL_PORT: String(CONTROL_PORT),
      },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      // In CI the app is built in an earlier step
      command: CI
        ? `npx next start -p ${WEB_PORT}`
        : `npx next build && npx next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/`,
      env: { API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});

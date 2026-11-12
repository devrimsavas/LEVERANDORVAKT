// Ports and fixed values shared by the Playwright config and the tests.
// They match tests/e2e in the repo root.

export const API_PORT = 3100;
export const WEB_PORT = 3101;
// The fake register's control server (tests/e2e/fakeServices.ts)
export const CONTROL_PORT = 3199;

export const API_URL = `http://localhost:${API_PORT}`;
export const CONTROL_URL = `http://localhost:${CONTROL_PORT}`;

// Created by the API on startup from tests/e2e/e2e.env
export const ADMIN = {
  email: "admin@e2e.example.com",
  password: "AdminE2eSecure2026",
};

// ASSISTANT_DAILY_LIMIT in tests/e2e/e2e.env
export const ASSISTANT_DAILY_LIMIT = 3;

// The example companies in the fake register
export const COMPANIES = {
  // Active, with roles and two years of healthy accounts
  transport: { orgNumber: "912345678", name: "EKSEMPEL TRANSPORT AS" },
  // Negative equity and two losses in a row
  bygg: { orgNumber: "923456789", name: "EKSEMPEL BYGG AS" },
  // Already bankrupt
  data: { orgNumber: "934567890", name: "EKSEMPEL DATA AS" },
  // Healthy until a test makes it go bankrupt
  leverandor: { orgNumber: "945678901", name: "EKSEMPEL LEVERANDØR AS" },
} as const;

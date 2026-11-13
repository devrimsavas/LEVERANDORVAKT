import { randomUUID } from "node:crypto";
import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { ADMIN, API_URL, CONTROL_URL } from "./settings";

export interface TestUser {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

// A new user for each test, so tests never depend on each other's data
export function newUser(): TestUser {
  return {
    firstName: "Ingrid",
    lastName: "Solberg",
    email: `e2e-${randomUUID()}@example.com`,
    password: "IngridSecure2026",
  };
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("main").getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

// Calls the API directly as the admin, to run the background jobs
export class AdminApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  static async logIn(request: APIRequestContext): Promise<AdminApi> {
    const res = await request.post(`${API_URL}/api/auth/login`, {
      data: ADMIN,
    });
    expect(res.ok()).toBeTruthy();
    return new AdminApi(request, (await res.json()).token);
  }

  async run(job: "change-detection" | "accounts-check") {
    const res = await this.request.post(`${API_URL}/api/admin/${job}/run`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    return res.json();
  }
}

// Makes a company go bankrupt in the fake register
export async function makeBankrupt(
  request: APIRequestContext,
  orgNumber: string,
) {
  const res = await request.post(
    `${CONTROL_URL}/companies/${orgNumber}/bankrupt`,
  );
  expect(res.status()).toBe(204);
}

interface Fixtures {
  // A newly registered user, logged in on the page. A test that only needs
  // to be logged in asks for it and marks it used with `void user`.
  user: TestUser;
  admin: AdminApi;
}

export const test = base.extend<Fixtures>({
  // Every page fails its test if the browser blocks anything under the
  // content security policy, so a policy that is too strict is found here
  page: async ({ page }, use) => {
    const blocked: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy/i.test(message.text())) {
        blocked.push(message.text());
      }
    });
    await use(page);
    expect(blocked, "blocked by the content security policy").toEqual([]);
  },
  user: async ({ page, request }, use) => {
    const user = newUser();
    const res = await request.post(`${API_URL}/api/auth/register`, {
      data: user,
    });
    expect(res.status()).toBe(201);
    await logIn(page, user.email, user.password);
    await use(user);
  },
  admin: async ({ request }, use) => {
    await use(await AdminApi.logIn(request));
  },
});

export { expect };

// Follows a company from its page
export async function follow(page: Page, orgNumber: string) {
  await page.goto(`/companies/${orgNumber}`);
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop following" }),
  ).toBeVisible();
}

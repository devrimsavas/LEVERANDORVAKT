import { expect, logIn, test } from "./fixtures";
import { ADMIN } from "./settings";

test("normal users neither see nor reach the admin page", async ({
  page,
  user,
}) => {
  void user;
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Admin" }),
  ).toHaveCount(0);
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
});

test("the admin sees the system, runs a job and finds a user", async ({
  page,
  request,
}) => {
  const user = {
    firstName: "Findme",
    lastName: "Person",
    email: `findme-${Date.now()}@example.com`,
    password: "FindmeSecure2026",
  };
  await request.post("http://localhost:3100/api/auth/register", { data: user });

  await logIn(page, ADMIN.email, ADMIN.password);
  await page.getByRole("banner").getByRole("link", { name: "Admin" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Admin");
  await expect(
    page.getByRole("heading", { name: "Background jobs" }),
  ).toBeVisible();
  await expect(page.getByText("ollama:e2e")).toBeVisible();

  const accounts = page
    .getByRole("article")
    .filter({ hasText: "Annual accounts check" });
  await accounts.getByRole("button", { name: "Run now" }).click();
  await expect(accounts.getByText(/^Done:/)).toBeVisible();

  await page.getByRole("searchbox", { name: "Search users" }).fill("findme");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("cell", { name: user.email })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Users (1)" })).toBeVisible();
});

import { expect, test } from "./fixtures";

// Runs in the "phone" project (Pixel 7)

async function expectNoSidewaysScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("public pages fit the screen and the menu works", async ({ page }) => {
  for (const path of ["/", "/guide", "/about", "/login"]) {
    await page.goto(path);
    await expectNoSidewaysScroll(page);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.locator("#site-menu").getByRole("link", { name: "Guide" }).click();
  await expect(page).toHaveURL(/\/guide$/);
});

test("app pages fit the screen", async ({ page, user }) => {
  void user;
  for (const path of [
    "/overview",
    "/watchlist",
    "/search",
    "/trends",
    "/assistant",
    "/notifications",
  ]) {
    await page.goto(path);
    await expectNoSidewaysScroll(page);
  }
  await page.getByRole("button", { name: "Menu" }).click();
  await page
    .locator("#site-menu")
    .getByRole("link", { name: "Trends" })
    .click();
  await expect(page).toHaveURL(/\/trends$/);
});

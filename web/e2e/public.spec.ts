import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("the landing page explains the service and links onward", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Know when a supplier changes for the worse, before it costs you",
    );
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Guide" })).toBeVisible();
    await expect(header.getByRole("link", { name: "About" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Contact" })).toBeVisible();
  });

  test("switches to Norwegian and back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Bytt til norsk" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "nb");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Om", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Switch to English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("switches between light and dark mode and remembers it", async ({
    page,
  }) => {
    await page.goto("/");
    const html = page.locator("html");
    const before = await html.getAttribute("data-color-scheme");
    await page
      .getByRole("button", { name: "Switch between light and dark mode" })
      .click();
    await expect(html).not.toHaveAttribute("data-color-scheme", before ?? "");
    const after = await html.getAttribute("data-color-scheme");

    await page.reload();
    await expect(html).toHaveAttribute("data-color-scheme", after!);
  });

  test("the guide has its contents and scenarios", async ({ page }) => {
    await page.goto("/guide");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Guide");
    const contents = page.getByRole("navigation", { name: "On this page" });
    await expect(contents.getByRole("link")).toHaveCount(8);
    await expect(
      page.getByRole("heading", { name: "A supplier goes bankrupt" }),
    ).toBeVisible();
    await expect(page.getByText("It is not a credit rating")).toBeVisible();
  });

  test("about and contact pages load", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "About Leverandørvakt",
    );
    await page.goto("/contact");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contact");
  });

  test("app pages send visitors to log in and back", async ({ page }) => {
    await page.goto("/watchlist");
    await expect(page).toHaveURL(/\/login\?next=%2Fwatchlist$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");
  });
});

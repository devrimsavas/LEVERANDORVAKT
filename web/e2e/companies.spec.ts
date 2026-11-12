import { expect, follow, test } from "./fixtures";
import { COMPANIES } from "./settings";

test.describe("search and company pages", () => {
  test("finds companies by name", async ({ page, user }) => {
    void user;
    await page.goto("/search");
    await page
      .getByRole("searchbox", { name: "Company name or organization number" })
      .fill("eksempel");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(
      page.getByRole("link", { name: COMPANIES.bygg.name }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: COMPANIES.transport.name }),
    ).toBeVisible();
  });

  test("goes straight to a company from its organization number", async ({
    page,
    user,
  }) => {
    void user;
    await page.goto("/search");
    await page
      .getByRole("searchbox", { name: "Company name or organization number" })
      .fill("912 345 678");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page).toHaveURL(`/companies/${COMPANIES.transport.orgNumber}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      COMPANIES.transport.name,
    );
  });

  test("shows roles, accounts and risk in tabs", async ({ page, user }) => {
    void user;
    // Following fetches the annual accounts right away
    await follow(page, COMPANIES.bygg.orgNumber);

    await page.getByRole("link", { name: "Roles" }).click();
    await expect(page.getByText("Lars Moen")).toBeVisible();

    await page.getByRole("link", { name: "Accounts" }).click();
    await expect(page.getByRole("table")).toContainText("Equity");

    await page.getByRole("link", { name: "Risk" }).click();
    await expect(page.getByText("Negative equity")).toBeVisible();
    await expect(page.getByText("High", { exact: true }).first()).toBeVisible();
  });

  test("follow, write a note, see it in the watchlist and stop following", async ({
    page,
    user,
  }) => {
    void user;
    await follow(page, COMPANIES.transport.orgNumber);
    await page.getByLabel("Your note").fill("Main transport supplier");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    await page.goto("/watchlist");
    const row = page.getByRole("main").getByText(COMPANIES.transport.name);
    await expect(row).toBeVisible();
    await expect(page.getByText("Main transport supplier")).toBeVisible();

    await page.goto(`/companies/${COMPANIES.transport.orgNumber}`);
    await page.getByRole("button", { name: "Stop following" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Stop following" })
      .click();
    await expect(
      page.getByRole("button", { name: "Follow", exact: true }),
    ).toBeVisible();
  });
});

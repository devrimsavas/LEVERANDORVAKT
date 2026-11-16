import type { Page } from "@playwright/test";
import { expect, follow, test } from "./fixtures";
import { COMPANIES } from "./settings";

const counted = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { counted?: { path: string }[] }).counted?.map(
        (vars) => vars.path,
      ) ?? [],
  );

test("every page is counted, without query strings or organization numbers", async ({
  page,
  user,
}) => {
  void user;
  await page.goto("/unsubscribe?token=secret-token-123");
  await expect.poll(() => counted(page)).toEqual(["/unsubscribe"]);

  // Moving between pages in the app loads no new page, but is counted
  await follow(page, COMPANIES.transport.orgNumber);
  await page.getByRole("link", { name: "Report (PDF)" }).click();
  await expect(page).toHaveURL(/\/report$/);
  await expect
    .poll(() => counted(page))
    .toEqual(
      expect.arrayContaining(["/companies/:org", "/companies/:org/report"]),
    );
  const paths = await counted(page);
  expect(paths.join(" ")).not.toMatch(/\d{9}|token/);
});

import { expect, test } from "./fixtures";

test("shows new companies per month and filters by municipality", async ({
  page,
  user,
}) => {
  void user;
  await page.goto("/trends");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trends");
  await expect(page.locator(".recharts-surface").first()).toBeVisible();

  await page.getByLabel("Municipality").selectOption({ label: "Drammen" });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/municipality=3301/);
  await expect(page.getByRole("main")).toContainText("Drammen");
});

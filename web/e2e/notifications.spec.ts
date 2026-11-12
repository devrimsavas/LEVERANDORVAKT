import { expect, follow, makeBankrupt, test } from "./fixtures";
import { COMPANIES } from "./settings";

test("a followed supplier going bankrupt gives a critical notification", async ({
  page,
  request,
  user,
  admin,
}) => {
  void user;
  await follow(page, COMPANIES.leverandor.orgNumber);
  // The first run of change detection only records where the feeds start
  await admin.run("change-detection");

  await makeBankrupt(request, COMPANIES.leverandor.orgNumber);
  const summary = await admin.run("change-detection");
  expect(summary.changesFound).toBeGreaterThan(0);

  await page.goto("/overview");
  const bell = page.getByRole("button", { name: /Notifications, \d+ unread/ });
  await expect(bell).toBeVisible();

  await page.goto("/notifications");
  const item = page
    .getByRole("listitem")
    .filter({ hasText: COMPANIES.leverandor.name });
  await expect(item.first()).toContainText("Critical");

  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(
    page.getByText("You have read all your notifications"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Notifications", exact: true }),
  ).toBeVisible();
});

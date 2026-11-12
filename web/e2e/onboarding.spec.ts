import { expect, follow, test } from "./fixtures";
import { COMPANIES } from "./settings";

test("the getting-started list follows the user's progress and can be closed", async ({
  page,
  user,
}) => {
  void user;
  const panel = page.getByRole("region", {
    name: "Get started in three steps",
  });
  await expect(panel).toContainText("0 of 3 done");
  // A new user cannot close it yet
  await expect(panel.getByRole("button", { name: "Close" })).toHaveCount(0);
  await expect(
    panel.getByRole("link", { name: "Read the guide" }),
  ).toBeVisible();

  await follow(page, COMPANIES.transport.orgNumber);
  await page.goto("/overview");
  await expect(panel).toContainText("1 of 3 done");
  await expect(
    panel.getByRole("link", {
      name: `Write a note for ${COMPANIES.transport.name}`,
    }),
  ).toBeVisible();

  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Companies followed" }),
  ).toHaveCount(0);
  await expect(panel).toHaveCount(0);
});

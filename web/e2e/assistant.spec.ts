import { expect, follow, test } from "./fixtures";
import { ASSISTANT_DAILY_LIMIT, COMPANIES } from "./settings";

test("asks the assistant and shows its answer safely", async ({
  page,
  user,
}) => {
  void user;
  await follow(page, COMPANIES.bygg.orgNumber);
  await page.goto("/assistant");
  await expect(
    page.getByText(
      `${ASSISTANT_DAILY_LIMIT} of ${ASSISTANT_DAILY_LIMIT} questions left`,
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: /highest risk/ }).click();
  await page.getByLabel("Your question").press("Enter");

  // A new conversation gets its own address and appears in the list
  await expect(page).toHaveURL(/\/assistant\?c=[0-9a-f-]{36}$/);
  const answer = page.locator('[data-role="assistant"]').last();
  await expect(answer.getByRole("table")).toContainText(COMPANIES.bygg.name);
  await expect(answer).toContainText("Based on: your watchlist");
  await expect(
    page.getByText(
      `${ASSISTANT_DAILY_LIMIT - 1} of ${ASSISTANT_DAILY_LIMIT} questions left`,
    ),
  ).toBeVisible();

  // HTML in an answer is shown as text and never runs; unsafe links keep
  // their text but lose the link, and images are not loaded
  await expect(answer).toContainText("<script>");
  expect(await page.evaluate(() => "__injected" in window)).toBe(false);
  await expect(answer.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(answer.getByText("unsafe link")).toBeVisible();
  await expect(answer.locator("img")).toHaveCount(0);
  const link = answer.getByRole("link", { name: "Brønnøysundregistrene" });
  await expect(link).toHaveAttribute("target", "_blank");

  // The conversation is kept
  await page.reload();
  await expect(
    page.locator('[data-role="assistant"]').getByRole("table"),
  ).toBeVisible();
});

test("stops at the daily limit", async ({ page, user }) => {
  void user;
  await page.goto("/assistant");
  for (let asked = 1; asked <= ASSISTANT_DAILY_LIMIT; asked++) {
    await page.getByLabel("Your question").fill(`Question ${asked}`);
    await page.getByLabel("Your question").press("Enter");
    await expect(
      page.getByText(
        `${ASSISTANT_DAILY_LIMIT - asked} of ${ASSISTANT_DAILY_LIMIT} questions left`,
      ),
    ).toBeVisible();
    await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  }
  await expect(page.getByText("You have used today's questions")).toBeVisible();
  await expect(page.getByLabel("Your question")).toBeDisabled();
});

test("deletes a conversation", async ({ page, user }) => {
  void user;
  await page.goto("/assistant");
  await page.getByLabel("Your question").fill("Hello");
  await page.getByLabel("Your question").press("Enter");
  await expect(page).toHaveURL(/\?c=/);

  await page
    .getByRole("button", { name: /^Delete conversation/ })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByText("No conversations yet.").first()).toBeAttached();
});

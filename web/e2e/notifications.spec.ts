import { expect, follow, makeBankrupt, test } from "./fixtures";
import { COMPANIES, CONTROL_URL } from "./settings";

test("a followed supplier going bankrupt gives a critical notification and an email", async ({
  page,
  request,
  user,
  admin,
}) => {
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

  // The critical change is emailed at once, even with the daily summary
  // chosen, from the fake Resend
  let emails: { subject: string; text: string }[] = [];
  await expect(async () => {
    const res = await request.get(
      `${CONTROL_URL}/emails?to=${encodeURIComponent(user.email)}`,
    );
    emails = await res.json();
    expect(emails).toHaveLength(1);
  }).toPass();
  expect(emails[0]!.subject).toBe(
    `${COMPANIES.leverandor.name}: Bankruptcy registered`,
  );

  // The link at the bottom of the email turns the emails off
  const unsubscribe = emails[0]!.text.match(
    /http:\/\/localhost:3101\/unsubscribe\?token=\S+/,
  )![0];
  await page.goto(unsubscribe);
  await page.getByRole("button", { name: "Turn off emails" }).click();
  await expect(
    page.getByText("Done. You get no more notification emails."),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Turn them on again in Settings" })
    .click();
  await expect(page.getByRole("radio", { name: "No emails" })).toBeChecked();
});

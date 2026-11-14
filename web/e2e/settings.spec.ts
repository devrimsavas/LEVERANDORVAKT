import { readFile } from "node:fs/promises";
import { expect, follow, logIn, test } from "./fixtures";
import { COMPANIES } from "./settings";

test("the settings page is in the user menu and shows the account", async ({
  page,
  user,
}) => {
  await page
    .getByRole("button", {
      name: `Account: ${user.firstName} ${user.lastName}`,
    })
    .click();
  await page.getByRole("link", { name: "Settings" }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await expect(page.getByRole("main").getByText(user.email)).toBeVisible();
});

test("changing the password keeps this device logged in and logs out the others", async ({
  page,
  browser,
  user,
}) => {
  const otherDevice = await browser.newContext();
  const otherPage = await otherDevice.newPage();
  await logIn(otherPage, user.email, user.password);

  await page.goto("/settings");
  await page.getByLabel("Current password").fill(user.password);
  await page.getByLabel("New password").fill("BrandNewPassword2026");
  await page.getByLabel("Repeat password").fill("BrandNewPassword2026");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your password has been changed.")).toBeVisible();

  // This device goes on with its new session
  await page.goto("/watchlist");
  await expect(page).toHaveURL(/\/watchlist$/);
  // The other device has to log in again
  await otherPage.goto("/watchlist");
  await expect(otherPage).toHaveURL(/\/login/);
  await logIn(otherPage, user.email, "BrandNewPassword2026");
  await otherDevice.close();
});

test("a wrong current password is refused", async ({ page, user }) => {
  void user;
  await page.goto("/settings");
  await page.getByLabel("Current password").fill("WrongPassword2026");
  await page.getByLabel("New password").fill("BrandNewPassword2026");
  await page.getByLabel("Repeat password").fill("BrandNewPassword2026");
  await page.getByRole("button", { name: "Change password" }).click();

  await expect(page.getByText("The password is wrong")).toBeVisible();
});

test("downloads all the user's data as a JSON file", async ({ page, user }) => {
  await follow(page, COMPANIES.transport.orgNumber);
  await page.getByLabel("Your note").fill("Main transport supplier");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.goto("/settings");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download my data (JSON)" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(
    /^leverandorvakt-data-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const data = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(data.user.email).toBe(user.email);
  expect(data.watchlist).toEqual([
    expect.objectContaining({
      orgNumber: COMPANIES.transport.orgNumber,
      note: "Main transport supplier",
    }),
  ]);
  expect(JSON.stringify(data)).not.toContain("passwordHash");
});

test("deletes the account after the password is typed", async ({
  page,
  user,
}) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Password").fill("WrongPassword2026");
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await expect(dialog.getByText("The password is wrong")).toBeVisible();

  await dialog.getByLabel("Password").fill(user.password);
  await dialog.getByRole("button", { name: "Delete my account" }).click();

  await expect(page).toHaveURL(/\/\?deleted=1$/);
  await expect(
    page.getByText("Your account and all its data have been deleted."),
  ).toBeVisible();
  // Logged out, and the account is gone
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("main").getByRole("button", { name: "Log in" }).click();
  await expect(
    page.getByText("The email address or password is wrong"),
  ).toBeVisible();
});

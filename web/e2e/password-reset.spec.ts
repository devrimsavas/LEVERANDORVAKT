import { expect, logIn, newUser, test } from "./fixtures";
import { API_URL, CONTROL_URL } from "./settings";

test("a forgotten password is reset with the emailed link", async ({
  page,
  browser,
  request,
}) => {
  const user = newUser();
  await request.post(`${API_URL}/api/auth/register`, { data: user });

  // A session on another device, started before the reset
  const otherDevice = await browser.newContext();
  const otherPage = await otherDevice.newPage();
  await logIn(otherPage, user.email, user.password);

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(
    page.getByRole("heading", { name: "Forgot your password?" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(
    page.getByText(`If an account has the address ${user.email}`),
  ).toBeVisible();

  // The email, from the fake Resend
  let emails: { subject: string; text: string }[] = [];
  await expect(async () => {
    const res = await request.get(
      `${CONTROL_URL}/emails?to=${encodeURIComponent(user.email)}`,
    );
    emails = await res.json();
    expect(emails).toHaveLength(1);
  }).toPass();
  expect(emails[0]!.subject).toBe("Reset your Leverandørvakt password");
  const link = emails[0]!.text.match(/http:\/\/localhost:3101\/\S+/)![0];

  await page.goto(link);
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await page.getByLabel("New password").fill("BrandNewPassword2026");
  await page.getByLabel("Repeat password").fill("BrandNewPassword2026");
  await page.getByRole("button", { name: "Save the new password" }).click();

  await expect(page).toHaveURL(/\/login\?reset=1$/);
  await expect(
    page.getByText("Your password has been changed. Log in with the new one."),
  ).toBeVisible();
  await logIn(page, user.email, "BrandNewPassword2026");

  // The link works only once
  await page.goto(link);
  await expect(page.getByText("This link no longer works.")).toBeVisible();

  // The session on the other device has ended
  await otherPage.goto("/watchlist");
  await expect(otherPage).toHaveURL(/\/login/);
  await otherDevice.close();
});

test("the reset form checks the new password before sending it", async ({
  page,
  request,
}) => {
  const user = newUser();
  await request.post(`${API_URL}/api/auth/register`, { data: user });
  await request.post(`${API_URL}/api/auth/password-reset`, {
    data: { email: user.email },
  });
  let link = "";
  await expect(async () => {
    const res = await request.get(
      `${CONTROL_URL}/emails?to=${encodeURIComponent(user.email)}`,
    );
    const emails: { text: string }[] = await res.json();
    link = emails[0]!.text.match(/http:\/\/localhost:3101\/\S+/)![0];
  }).toPass();

  await page.goto(link);
  await page.getByLabel("New password").fill("short");
  await page.getByLabel("Repeat password").fill("short");
  await page.getByRole("button", { name: "Save the new password" }).click();
  await expect(
    page.getByText("The password must be at least 8 characters"),
  ).toBeVisible();

  await page.getByLabel("New password").fill("BrandNewPassword2026");
  await page.getByLabel("Repeat password").fill("SomethingElse2026");
  await page.getByRole("button", { name: "Save the new password" }).click();
  await expect(page.getByText("The passwords are not the same")).toBeVisible();
});

test("an unknown email gets the same answer, and a made-up link is refused", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(
    page.getByText("If an account has the address nobody@example.com"),
  ).toBeVisible();

  await page.goto("/reset-password?token=made-up");
  await expect(page.getByText("This link no longer works.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ask for a new link" }),
  ).toBeVisible();
});

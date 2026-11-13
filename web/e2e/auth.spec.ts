import { expect, logIn, newUser, test } from "./fixtures";

test.describe("accounts", () => {
  test("creating an account logs in and shows the overview", async ({
    page,
  }) => {
    const user = newUser();
    await page.goto("/register");
    await page.getByLabel("First name").fill(user.firstName);
    await page.getByLabel("Last name").fill(user.lastName);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByLabel("Repeat password").fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Welcome, ${user.firstName}`,
    );
  });

  test("shows a message for each wrong field", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("First name").fill("Ingrid");
    await page.getByLabel("Last name").fill("Solberg");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("IngridSecure2026");
    await page.getByLabel("Repeat password").fill("SomethingElse2026");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(
      page.getByText("The passwords are not the same"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("a wrong password is refused, the right one goes back to the page asked for", async ({
    page,
    request,
  }) => {
    const user = newUser();
    await request.post("http://localhost:3100/api/auth/register", {
      data: user,
    });

    await page.goto("/trends");
    await expect(page).toHaveURL(/\/login\?next=%2Ftrends$/);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("WrongPassword2026");
    await page
      .getByRole("main")
      .getByRole("button", { name: "Log in" })
      .click();
    await expect(
      page.getByText("The email address or password is wrong"),
    ).toBeVisible();

    await page.getByLabel("Password").fill(user.password);
    await page
      .getByRole("main")
      .getByRole("button", { name: "Log in" })
      .click();
    await expect(page).toHaveURL(/\/trends$/);
  });

  test("logging out ends the session", async ({ page, request }) => {
    const user = newUser();
    await request.post("http://localhost:3100/api/auth/register", {
      data: user,
    });
    await logIn(page, user.email, user.password);

    await page
      .getByRole("button", {
        name: `Account: ${user.firstName} ${user.lastName}`,
      })
      .click();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login/);
  });
});

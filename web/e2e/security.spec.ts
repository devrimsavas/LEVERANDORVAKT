import { expect, newUser, test } from "./fixtures";
import { API_URL } from "./settings";

test("pages come with security headers and a new script nonce each time", async ({
  page,
}) => {
  const first = await page.goto("/");
  const headers = first!.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers).not.toHaveProperty("x-powered-by");

  const policy = headers["content-security-policy"]!;
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain("unsafe-eval");
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  // Next.js puts the nonce on its own scripts
  await expect(page.locator(`script[nonce]`).first()).toBeAttached();

  const second = await page.goto("/guide");
  const secondNonce = second!
    .headers()
    ["content-security-policy"]!.match(/'nonce-([^']+)'/)?.[1];
  expect(secondNonce).not.toBe(nonce);
});

test("an injected inline script does not run", async ({ context }) => {
  // A page of its own: the browser reports the blocked script, which the
  // `page` fixture would count as a mistake in the policy
  const page = await context.newPage();
  await page.goto("/");
  // As if an attacker had got HTML with an inline event handler into the
  // page, the most common way to run code through a gap in escaping
  const ran = await page.evaluate(async () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<img src="/missing.png" onerror="window.__injected = true">',
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    return "__injected" in window;
  });
  expect(ran).toBe(false);
});

test.describe("login attempts", () => {
  test("too many wrong passwords stop logins for a while", async ({
    page,
    request,
  }) => {
    const user = newUser();
    await request.post(`${API_URL}/api/auth/register`, { data: user });
    const password = page.getByLabel("Password");
    const submit = page
      .getByRole("main")
      .getByRole("button", { name: "Log in" });

    const logIn = async (value: string) => {
      await password.fill(value);
      // Wait for the form's answer, and for the form to empty the password
      // field afterwards, before trying again
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/login",
        ),
        submit.click(),
      ]);
      await expect(password).toHaveValue("");
    };

    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    // LOGIN_FAILURES_PER_ACCOUNT in tests/e2e/e2e.env
    for (let attempt = 0; attempt < 5; attempt++) {
      await logIn("WrongPassword2026");
      await expect(
        page.getByText("The email address or password is wrong"),
      ).toBeVisible();
    }

    // Even the right password is refused until the time is up
    await logIn(user.password);
    await expect(
      page.getByText(
        /Too many failed attempts\. Wait 1[45] minutes and try again\./,
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { PasswordResetToken } from "../src/models/PasswordResetToken.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { useFakeBrreg } from "./helpers/fakeBrreg.js";
import {
  FAKE_RESEND_API_KEY,
  FAKE_WEB_APP_URL,
  useFakeEmail,
  type SentEmail,
} from "./helpers/fakeEmail.js";

const brreg = useFakeBrreg();
const email = useFakeEmail(brreg);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function askForReset(address: string, language?: string) {
  return request(app)
    .post("/api/auth/password-reset")
    .send({ email: address, ...(language ? { language } : {}) });
}

// The email is sent after the answer, so the tests wait for it
async function waitForEmail(count = 1): Promise<SentEmail> {
  await vi.waitFor(() => expect(email.sent).toHaveLength(count));
  return email.sent[count - 1]!;
}

function tokenFrom(sent: SentEmail): string {
  const link = sent.text.match(/https?:\/\/\S+/)?.[0];
  return new URL(link!).searchParams.get("token")!;
}

async function resetTokenFor(address: string): Promise<string> {
  await askForReset(address).expect(202);
  return tokenFrom(await waitForEmail(email.sent.length + 1));
}

function confirm(token: string, password: string) {
  return request(app)
    .post("/api/auth/password-reset/confirm")
    .send({ token, password });
}

function check(token: unknown) {
  return request(app).post("/api/auth/password-reset/check").send({ token });
}

function logIn(address: string, password: string) {
  return request(app)
    .post("/api/auth/login")
    .send({ email: address, password });
}

// A short wait, to show that nothing happens later either
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

describe("POST /api/auth/password-reset", () => {
  it("sends a link to the account's email", async () => {
    await registerAndLogin(lukas);

    const res = await askForReset(lukas.email);

    expect(res.status).toBe(202);
    const sent = await waitForEmail();
    expect(sent.to).toEqual([lukas.email]);
    expect(sent.from).toBe("Leverandørvakt <test@example.com>");
    expect(sent.authorization).toBe(`Bearer ${FAKE_RESEND_API_KEY}`);
    expect(sent.subject).toBe("Reset your Leverandørvakt password");
    expect(sent.text).toContain(`Hi ${lukas.firstName},`);
    expect(sent.text).toContain("60 minutes");
    expect(sent.text).toMatch(
      new RegExp(`${FAKE_WEB_APP_URL}/reset-password\\?token=[\\w-]{43}`),
    );
    expect(sent.html).toContain(
      `href="${FAKE_WEB_APP_URL}/reset-password?token=`,
    );
  });

  it("writes the email in Norwegian when asked", async () => {
    await registerAndLogin(lukas);

    await askForReset(lukas.email, "nb").expect(202);

    const sent = await waitForEmail();
    expect(sent.subject).toBe("Tilbakestill passordet ditt i Leverandørvakt");
    expect(sent.text).toContain(`Hei ${lukas.firstName},`);
  });

  it("finds the account however the email is written", async () => {
    await registerAndLogin(lukas);

    await askForReset(`  ${lukas.email.toUpperCase()} `).expect(202);

    expect((await waitForEmail()).to).toEqual([lukas.email]);
  });

  it("answers the same for an unknown email, and sends nothing", async () => {
    const res = await askForReset("nobody@example.com");

    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      message: "If an account has this email, a reset link has been sent",
    });
    await settle();
    expect(email.sent).toHaveLength(0);
  });

  it("escapes the name in the HTML version", async () => {
    await registerAndLogin({ ...lukas, firstName: "<b>Lukas</b>" });

    await askForReset(lukas.email).expect(202);

    const sent = await waitForEmail();
    expect(sent.html).toContain("Hi &lt;b&gt;Lukas&lt;/b&gt;,");
    expect(sent.html).not.toContain("<b>Lukas</b>");
  });

  it("stores only a hash of the token", async () => {
    await registerAndLogin(lukas);
    const token = await resetTokenFor(lukas.email);

    const rows = await PasswordResetToken.findAll();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(rows[0]!.tokenHash).not.toContain(token);
  });

  it("makes an earlier link stop working", async () => {
    await registerAndLogin(lukas);
    const first = await resetTokenFor(lukas.email);
    const second = await resetTokenFor(lukas.email);

    expect((await check(first)).body).toEqual({ valid: false });
    expect((await check(second)).body).toEqual({ valid: true });
  });

  it("returns 400 without a valid email", async () => {
    const res = await askForReset("not-an-email");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A valid email is required");
  });

  it("still answers 202 when the email cannot be sent, and logs why", async () => {
    await registerAndLogin(lukas);
    email.failure = { status: 403, message: "The domain is not verified" };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await askForReset(lukas.email);

    expect(res.status).toBe(202);
    await vi.waitFor(() => expect(logged).toHaveBeenCalled());
    expect(String(logged.mock.calls[0]?.[1])).toContain(
      "Resend refused the email (403): The domain is not verified",
    );
  });

  it("only writes the email to the console with EMAIL_PROVIDER=log", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "log");
    await registerAndLogin(lukas);
    const printed = vi.spyOn(console, "log").mockImplementation(() => {});

    await askForReset(lukas.email).expect(202);

    await vi.waitFor(() => expect(printed).toHaveBeenCalled());
    expect(String(printed.mock.calls[0]?.[0])).toContain(
      `${FAKE_WEB_APP_URL}/reset-password?token=`,
    );
    expect(email.sent).toHaveLength(0);
  });

  it("is limited per account", async () => {
    vi.stubEnv("PASSWORD_RESETS_PER_ACCOUNT", "2");
    await registerAndLogin(kari);

    await askForReset(kari.email).expect(202);
    await askForReset(kari.email).expect(202);
    const res = await askForReset(kari.email);

    expect(res.status).toBe(429);
    expect(res.body.error).toBe(
      "Too many password reset emails. Try again later.",
    );
    await waitForEmail(2);
  });
});

describe("POST /api/auth/password-reset/check", () => {
  it("says whether a link works", async () => {
    await registerAndLogin(lukas);
    const token = await resetTokenFor(lukas.email);

    expect((await check(token)).body).toEqual({ valid: true });
    expect((await check("made-up-token")).body).toEqual({ valid: false });
    expect((await check(undefined)).body).toEqual({ valid: false });
    expect((await check("x".repeat(500))).body).toEqual({ valid: false });
  });

  it("says no once the link has expired", async () => {
    await registerAndLogin(lukas);
    const token = await resetTokenFor(lukas.email);
    await PasswordResetToken.update(
      { expiresAt: new Date(Date.now() - 1000) },
      { where: {} },
    );

    expect((await check(token)).body).toEqual({ valid: false });
  });
});

describe("POST /api/auth/password-reset/confirm", () => {
  it("sets the new password, so only the new one logs in", async () => {
    await registerAndLogin(lukas);
    const token = await resetTokenFor(lukas.email);

    const res = await confirm(token, "BrandNewPassword1");

    expect(res.status).toBe(204);
    expect((await logIn(lukas.email, "BrandNewPassword1")).status).toBe(200);
    expect((await logIn(lukas.email, lukas.password)).status).toBe(401);
  });

  it("works only once", async () => {
    await registerAndLogin(lukas);
    const token = await resetTokenFor(lukas.email);
    await confirm(token, "BrandNewPassword1").expect(204);

    const again = await confirm(token, "AnotherPassword1");

    expect(again.status).toBe(400);
    expect(again.body.error).toBe("This link is invalid or has expired");
    expect((await logIn(lukas.email, "BrandNewPassword1")).status).toBe(200);
  });

  it("refuses an expired link", async () => {
    await registerAndLogin(lukas);
    const token = await resetTokenFor(lukas.email);
    await PasswordResetToken.update(
      { expiresAt: new Date(Date.now() - 1000) },
      { where: {} },
    );

    const res = await confirm(token, "BrandNewPassword1");

    expect(res.status).toBe(400);
    expect((await logIn(lukas.email, lukas.password)).status).toBe(200);
  });

  it("refuses a made-up link", async () => {
    const res = await confirm("made-up-token", "BrandNewPassword1");

    expect(res.status).toBe(400);
  });

  it("refuses a short password and keeps the link working", async () => {
    await registerAndLogin(lukas);
    const token = await resetTokenFor(lukas.email);

    const res = await confirm(token, "short");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Password must be at least 8 characters");
    expect((await check(token)).body).toEqual({ valid: true });
  });

  it("changes only that user's password", async () => {
    await registerAndLogin(lukas);
    await registerAndLogin(kari);
    const token = await resetTokenFor(lukas.email);

    await confirm(token, "BrandNewPassword1").expect(204);

    expect((await logIn(kari.email, kari.password)).status).toBe(200);
  });

  it("ends the sessions started before, even in the same second, but not a new one", async () => {
    // The clock is set by hand, so all of it happens within one second
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T10:00:00.100Z"));
    const { auth: oldSession } = await registerAndLogin(lukas);
    const token = await resetTokenFor(lukas.email);

    vi.setSystemTime(new Date("2026-11-14T10:00:00.600Z"));
    await confirm(token, "BrandNewPassword1").expect(204);
    vi.setSystemTime(new Date("2026-11-14T10:00:00.900Z"));
    const login = await logIn(lukas.email, "BrandNewPassword1");
    const old = await request(app).get("/api/auth/me").set(oldSession);
    const fresh = await request(app)
      .get("/api/auth/me")
      .set({ Authorization: `Bearer ${login.body.token}` });

    expect(old.status).toBe(401);
    expect(old.body.error).toBe("The password has changed. Log in again.");
    expect(fresh.status).toBe(200);
  });

  it("lets a user locked out by wrong passwords log in again", async () => {
    vi.stubEnv("LOGIN_FAILURES_PER_ACCOUNT", "2");
    await registerAndLogin(kari);
    await logIn(kari.email, "WrongPassword1").expect(401);
    await logIn(kari.email, "WrongPassword1").expect(401);
    expect((await logIn(kari.email, kari.password)).status).toBe(429);

    const token = await resetTokenFor(kari.email);
    await confirm(token, "BrandNewPassword1").expect(204);

    expect((await logIn(kari.email, "BrandNewPassword1")).status).toBe(200);
  });
});

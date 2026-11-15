import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { CompanyRecord } from "../src/models/CompanyRecord.js";
import { CompanyChange } from "../src/models/CompanyChange.js";
import { Notification } from "../src/models/Notification.js";
import { runChangeDetectionOnce } from "../src/jobs/changeDetectionJob.js";
import {
  sendDailyDigests,
  sendInstantEmails,
  unsubscribeToken,
} from "../src/services/emailNotificationService.js";
import { ensureAdmin } from "../src/config/ensureAdmin.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, useFakeBrreg } from "./helpers/fakeBrreg.js";
import { FAKE_WEB_APP_URL, useFakeEmail } from "./helpers/fakeEmail.js";

const brreg = useFakeBrreg();
const email = useFakeEmail(brreg);

const ALTA_TOURS = "912345678";
const ARCTIC_FISH = "923456789";

// 07:30 in Oslo on 16 November (winter time, UTC+1)
const MORNING = new Date("2026-11-16T06:30:00Z");

beforeEach(() => {
  vi.stubEnv("EMAIL_DIGEST_HOUR", "7");
  vi.stubEnv("EMAIL_TIME_ZONE", "Europe/Oslo");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type Person = typeof lukas;

async function userRecord(person: Person): Promise<User> {
  return User.findOne({ where: { email: person.email }, rejectOnEmpty: true });
}

async function companyRecord(orgNumber: string, name: string) {
  const [company] = await CompanyRecord.findOrCreate({
    where: { orgNumber },
    defaults: {
      orgNumber,
      name,
      snapshot: {},
      lastCheckedAt: new Date(),
    } as never,
  });
  return company;
}

// A notification for the user about a change, as change detection makes it
async function notify(
  person: Person,
  change: {
    orgNumber?: string;
    companyName?: string;
    field?: string;
    oldValue?: unknown;
    newValue?: unknown;
    severity?: "info" | "warning" | "critical";
    createdAt?: Date;
    readAt?: Date | null;
  } = {},
) {
  const user = await userRecord(person);
  const company = await companyRecord(
    change.orgNumber ?? ALTA_TOURS,
    change.companyName ?? "ALTA TOURS AS",
  );
  const companyChange = await CompanyChange.create({
    companyId: company.id,
    field: change.field ?? "name",
    oldValue: change.oldValue ?? "ALTA TOURS AS",
    newValue: change.newValue ?? "ALTA REISER AS",
    severity: change.severity ?? "info",
    sourceUpdateId: null,
    detectedAt: new Date(),
  });
  const notification = await Notification.create({
    userId: user.id,
    companyChangeId: companyChange.id,
    readAt: change.readAt ?? null,
  });
  if (change.createdAt) {
    await Notification.update({ createdAt: change.createdAt } as never, {
      where: { id: notification.id },
      silent: true,
    });
  }
  return notification;
}

async function setChoice(person: Person, emailNotifications: string) {
  await User.update({ emailNotifications } as never, {
    where: { email: person.email },
  });
}

const sentTo = (person: Person) =>
  email.sent.filter((sent) => sent.to.includes(person.email));

describe("preferences", () => {
  it("are part of the user, with English and daily summaries by default", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).get("/api/auth/me").set(auth);

    expect(res.body).toMatchObject({
      language: "en",
      emailNotifications: "daily",
    });
  });

  it("take the language the account was made in", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...lukas, language: "nb" });

    expect(res.status).toBe(201);
    expect(res.body.language).toBe("nb");
  });

  it("use English for an unknown language when registering", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...lukas, language: "tr" });

    expect(res.body.language).toBe("en");
  });

  it("can be changed", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .patch("/api/auth/me/preferences")
      .set(auth)
      .send({ language: "nb", emailNotifications: "instant" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      language: "nb",
      emailNotifications: "instant",
    });
    expect(await userRecord(lukas)).toMatchObject({
      language: "nb",
      emailNotifications: "instant",
    });
  });

  it("can be changed one at a time", async () => {
    const { auth } = await registerAndLogin(lukas);

    await request(app)
      .patch("/api/auth/me/preferences")
      .set(auth)
      .send({ emailNotifications: "off" })
      .expect(200);

    expect(await userRecord(lukas)).toMatchObject({
      language: "en",
      emailNotifications: "off",
    });
  });

  it.each([
    [{ language: "de" }, "language must be en or nb"],
    [
      { emailNotifications: "weekly" },
      "emailNotifications must be instant, daily or off",
    ],
  ])("refuses %j", async (body, error) => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .patch("/api/auth/me/preferences")
      .set(auth)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
  });

  it("need a token", async () => {
    const res = await request(app).patch("/api/auth/me/preferences").send({});

    expect(res.status).toBe(401);
  });
});

describe("emails at once", () => {
  it("send critical changes at once to users with daily summaries", async () => {
    await registerAndLogin(lukas);
    await notify(lukas, {
      field: "isBankrupt",
      oldValue: false,
      newValue: true,
      severity: "critical",
    });

    const summary = await sendInstantEmails();

    expect(summary).toEqual({
      usersEmailed: 1,
      notificationsEmailed: 1,
      failedUsers: 0,
    });
    const [sent] = sentTo(lukas);
    expect(sent!.subject).toBe("ALTA TOURS AS: Bankruptcy registered");
    expect(sent!.text).toContain(`Hi ${lukas.firstName},`);
    expect(sent!.text).toContain(
      "[Critical] ALTA TOURS AS (912345678): Bankruptcy registered",
    );
    expect(sent!.text).toContain("Before: No");
    expect(sent!.text).toContain("Now: Yes");
    expect(sent!.text).toContain(`${FAKE_WEB_APP_URL}/companies/912345678`);
  });

  it("keep other changes for the daily summary", async () => {
    await registerAndLogin(lukas);
    await notify(lukas, { severity: "warning" });

    await sendInstantEmails();

    expect(email.sent).toHaveLength(0);
  });

  it("send every change to users who want them at once, in one email", async () => {
    await registerAndLogin(lukas);
    await setChoice(lukas, "instant");
    await notify(lukas, { severity: "info" });
    await notify(lukas, {
      orgNumber: ARCTIC_FISH,
      companyName: "ARCTIC FISH AS",
      field: "roles.ceo",
      oldValue: "Kari Nordmann",
      newValue: "Ola Hansen",
      severity: "warning",
    });

    await sendInstantEmails();

    const sent = sentTo(lukas);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("2 changes in the companies you follow");
    expect(sent[0]!.text).toContain("New company name");
    expect(sent[0]!.text).toContain("ARCTIC FISH AS (923456789): New CEO");
    expect(sent[0]!.text).toContain("Before: Kari Nordmann");
  });

  it("send nothing to users who turned the emails off", async () => {
    await registerAndLogin(lukas);
    await setChoice(lukas, "off");
    await notify(lukas, {
      severity: "critical",
      field: "isBankrupt",
      newValue: true,
    });

    await sendInstantEmails();

    expect(email.sent).toHaveLength(0);
  });

  it("never send the same notification twice", async () => {
    await registerAndLogin(lukas);
    await setChoice(lukas, "instant");
    await notify(lukas);

    await sendInstantEmails();
    await sendInstantEmails();

    expect(email.sent).toHaveLength(1);
  });

  it("send a notification once even when two runs overlap", async () => {
    await registerAndLogin(lukas);
    await setChoice(lukas, "instant");
    await notify(lukas);

    await Promise.all([sendInstantEmails(), sendInstantEmails()]);

    expect(email.sent).toHaveLength(1);
  });

  it("send each user only their own notifications", async () => {
    await registerAndLogin(lukas);
    await registerAndLogin(kari);
    await setChoice(lukas, "instant");
    await setChoice(kari, "instant");
    await notify(lukas, {
      orgNumber: ALTA_TOURS,
      companyName: "ALTA TOURS AS",
    });
    await notify(kari, {
      orgNumber: ARCTIC_FISH,
      companyName: "ARCTIC FISH AS",
      oldValue: "ARCTIC FISH AS",
      newValue: "ARCTIC SEAFOOD AS",
    });

    await sendInstantEmails();

    expect(sentTo(lukas)).toHaveLength(1);
    expect(sentTo(lukas)[0]!.text).not.toContain("ARCTIC FISH");
    expect(sentTo(kari)[0]!.text).not.toContain("ALTA TOURS");
  });

  it("skip notifications already read in the app, without sending them later", async () => {
    await registerAndLogin(lukas);
    await setChoice(lukas, "instant");
    await notify(lukas, { readAt: new Date() });

    await sendInstantEmails();
    await sendDailyDigests({ now: MORNING, force: true });

    expect(email.sent).toHaveLength(0);
  });

  it("leave out notifications older than two days", async () => {
    await registerAndLogin(lukas);
    await setChoice(lukas, "instant");
    await notify(lukas, { createdAt: new Date(Date.now() - 49 * 3600_000) });

    await sendInstantEmails();

    expect(email.sent).toHaveLength(0);
  });

  it("are written in Norwegian for Norwegian users", async () => {
    await registerAndLogin(lukas);
    await User.update({ language: "nb" } as never, {
      where: { email: lukas.email },
    });
    await notify(lukas, {
      field: "riskLevel",
      oldValue: { level: "low", score: 5 },
      newValue: { level: "high", score: 55 },
      severity: "critical",
    });

    await sendInstantEmails();

    const [sent] = sentTo(lukas);
    expect(sent!.subject).toBe("ALTA TOURS AS: Risikonivå endret");
    expect(sent!.text).toContain(`Hei ${lukas.firstName},`);
    expect(sent!.text).toContain("Før: Lav (5 poeng)");
    expect(sent!.text).toContain("Nå: Høy (55 poeng)");
  });

  it("escape company names in the HTML version", async () => {
    await registerAndLogin(lukas);
    await notify(lukas, {
      companyName: "<b>BAD</b> AS",
      severity: "critical",
      field: "isBankrupt",
      newValue: true,
    });

    await sendInstantEmails();

    const [sent] = sentTo(lukas);
    expect(sent!.html).toContain("&lt;b&gt;BAD&lt;/b&gt; AS");
    expect(sent!.html).not.toContain("<b>BAD</b>");
  });

  it("carry a link and a one-click header to turn them off", async () => {
    await registerAndLogin(lukas);
    await notify(lukas, {
      severity: "critical",
      field: "isBankrupt",
      newValue: true,
    });
    const token = encodeURIComponent(
      unsubscribeToken((await userRecord(lukas)).publicId),
    );

    await sendInstantEmails();

    const [sent] = sentTo(lukas);
    expect(sent!.text).toContain(
      `${FAKE_WEB_APP_URL}/unsubscribe?token=${token}`,
    );
    expect(sent!.headers).toEqual({
      "List-Unsubscribe": `<${FAKE_WEB_APP_URL}/unsubscribe/one-click?token=${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("are tried again later when Resend fails, and other users still get theirs", async () => {
    await registerAndLogin(lukas);
    await setChoice(lukas, "instant");
    await notify(lukas);
    email.failure = { status: 500, message: "Down" };

    const failed = await sendInstantEmails();
    email.failure = null;
    const retried = await sendInstantEmails();

    expect(failed).toEqual({
      usersEmailed: 0,
      notificationsEmailed: 0,
      failedUsers: 1,
    });
    expect(retried.usersEmailed).toBe(1);
    expect(email.sent).toHaveLength(1);
  });

  it("go out right after change detection finds a bankruptcy", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS })
      .expect(201);
    await runChangeDetectionOnce();
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS", { konkurs: true }));
    brreg.addUpdate(ALTA_TOURS);

    await runChangeDetectionOnce();

    const sent = sentTo(lukas);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("ALTA TOURS AS: Bankruptcy registered");
  });
});

describe("daily summaries", () => {
  it("collect the day's changes in one email in the morning", async () => {
    await registerAndLogin(lukas);
    await notify(lukas, { severity: "info" });
    await notify(lukas, {
      severity: "warning",
      field: "website",
      newValue: "www.alta.no",
    });

    const summary = await sendDailyDigests({ now: MORNING });

    expect(summary).toEqual({
      usersEmailed: 1,
      notificationsEmailed: 2,
      failedUsers: 0,
    });
    const [sent] = sentTo(lukas);
    expect(sent!.subject).toBe("Your daily summary: 2 changes");
    expect(sent!.text).toContain("New website");
  });

  it("wait for the hour", async () => {
    await registerAndLogin(lukas);
    await notify(lukas);

    // 06:30 in Oslo
    await sendDailyDigests({ now: new Date("2026-11-16T05:30:00Z") });

    expect(email.sent).toHaveLength(0);
  });

  it("follow summer time", async () => {
    await registerAndLogin(lukas);
    const june = new Date("2027-06-14T05:30:00Z");
    await notify(lukas, { createdAt: new Date(june.getTime() - 3600_000) });

    // 07:30 in Oslo in June is 05:30 UTC
    await sendDailyDigests({ now: june });

    expect(email.sent).toHaveLength(1);
  });

  it("come once a day, and the next day again", async () => {
    await registerAndLogin(lukas);
    await notify(lukas);
    await sendDailyDigests({ now: MORNING });

    await notify(lukas, { field: "website", newValue: "www.alta.no" });
    await sendDailyDigests({ now: new Date("2026-11-16T14:00:00Z") });
    expect(email.sent).toHaveLength(1);

    await sendDailyDigests({ now: new Date("2026-11-17T06:30:00Z") });
    expect(email.sent).toHaveLength(2);
    expect(email.sent[1]!.text).toContain("New website");
  });

  it("are not sent when nothing has changed", async () => {
    await registerAndLogin(lukas);

    await sendDailyDigests({ now: MORNING });

    expect(email.sent).toHaveLength(0);
  });

  it("leave out what was already emailed at once", async () => {
    await registerAndLogin(lukas);
    await notify(lukas, {
      severity: "critical",
      field: "isBankrupt",
      newValue: true,
    });
    await sendInstantEmails();

    await sendDailyDigests({ now: MORNING, force: true });

    expect(email.sent).toHaveLength(1);
  });

  it("go only to users who chose them", async () => {
    await registerAndLogin(lukas);
    await registerAndLogin(kari);
    await setChoice(kari, "off");
    await notify(lukas);
    await notify(kari);

    await sendDailyDigests({ now: MORNING });

    expect(sentTo(lukas)).toHaveLength(1);
    expect(sentTo(kari)).toHaveLength(0);
  });

  it("can be sent now by force, whatever the hour", async () => {
    await registerAndLogin(lukas);
    await notify(lukas);

    await sendDailyDigests({
      now: new Date("2026-11-16T02:00:00Z"),
      force: true,
    });

    expect(email.sent).toHaveLength(1);
  });

  it("are tried again the same day when sending fails", async () => {
    await registerAndLogin(lukas);
    await notify(lukas);
    email.failure = { status: 500, message: "Down" };

    await sendDailyDigests({ now: MORNING });
    email.failure = null;
    await sendDailyDigests({ now: new Date("2026-11-16T07:00:00Z") });

    expect(email.sent).toHaveLength(1);
  });
});

describe("POST /api/email/unsubscribe", () => {
  it("turns the emails off with the link from an email, without logging in", async () => {
    await registerAndLogin(lukas);
    const token = unsubscribeToken((await userRecord(lukas)).publicId);

    const res = await request(app)
      .post("/api/email/unsubscribe")
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ emailNotifications: "off" });
    expect((await userRecord(lukas)).emailNotifications).toBe("off");
  });

  it("refuses a changed or made-up link", async () => {
    await registerAndLogin(lukas);
    await registerAndLogin(kari);
    const lukasToken = unsubscribeToken((await userRecord(lukas)).publicId);
    const kariId = Buffer.from((await userRecord(kari)).publicId).toString(
      "base64url",
    );
    // Lukas's signature on Kari's id
    const forged = `${kariId}.${lukasToken.split(".")[1]}`;

    for (const token of [forged, "made-up", "", undefined, "a.b"]) {
      const res = await request(app)
        .post("/api/email/unsubscribe")
        .send({ token });
      expect(res.status).toBe(400);
    }
    expect((await userRecord(kari)).emailNotifications).toBe("daily");
  });
});

async function loginAsAdmin() {
  vi.stubEnv("ADMIN_EMAIL", "admin@leverandorvakt.no");
  vi.stubEnv("ADMIN_PASSWORD", "AdminSecure2026");
  vi.stubEnv("ADMIN_FIRST_NAME", "Admin");
  vi.stubEnv("ADMIN_LAST_NAME", "Leverandørvakt");
  await ensureAdmin();
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@leverandorvakt.no", password: "AdminSecure2026" });
  return { Authorization: `Bearer ${res.body.token}` };
}

describe("POST /api/admin/emails/run", () => {
  it("sends the daily summaries now, for admins only", async () => {
    const adminAuth = await loginAsAdmin();
    const { auth } = await registerAndLogin(lukas);
    await notify(lukas);

    const refused = await request(app).post("/api/admin/emails/run").set(auth);
    const res = await request(app).post("/api/admin/emails/run").set(adminAuth);

    expect(refused.status).toBe(403);
    expect(res.status).toBe(200);
    expect(res.body.digest).toEqual({
      usersEmailed: 1,
      notificationsEmailed: 1,
      failedUsers: 0,
    });
    expect(sentTo(lukas)).toHaveLength(1);
  });
});

describe("the admin status", () => {
  it("shows the provider, what waits to be emailed and the last email", async () => {
    const adminAuth = await loginAsAdmin();
    await registerAndLogin(lukas);
    await registerAndLogin(kari);
    await setChoice(kari, "off");
    await notify(lukas);
    await notify(lukas, { readAt: new Date() });
    await notify(lukas, {
      createdAt: new Date(Date.now() - 8 * 24 * 3600_000),
    });
    await notify(kari);

    const before = await request(app).get("/api/admin/status").set(adminAuth);
    await sendDailyDigests({ force: true });
    const after = await request(app).get("/api/admin/status").set(adminAuth);

    expect(before.body.emails).toEqual({
      running: false,
      provider: "resend",
      waiting: 1,
      lastSentAt: null,
    });
    expect(after.body.emails.waiting).toBe(0);
    expect(Date.parse(after.body.emails.lastSentAt)).toBeGreaterThan(
      Date.now() - 60_000,
    );
  });
});

import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { CompanyRecord } from "../src/models/CompanyRecord.js";
import { CompanyChange } from "../src/models/CompanyChange.js";
import { Notification } from "../src/models/Notification.js";
import { WatchlistEntry } from "../src/models/WatchlistEntry.js";
import { AssistantConversation } from "../src/models/AssistantConversation.js";
import { AssistantMessage } from "../src/models/AssistantMessage.js";
import { AssistantUsage } from "../src/models/AssistantUsage.js";
import { PasswordResetToken } from "../src/models/PasswordResetToken.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, useFakeBrreg } from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";

type Auth = Record<string, string>;

afterEach(() => {
  vi.unstubAllEnvs();
});

async function userRecord(email: string): Promise<User> {
  return User.findOne({ where: { email }, rejectOnEmpty: true });
}

function logIn(email: string, password: string) {
  return request(app).post("/api/auth/login").send({ email, password });
}

// Gives the user one of everything that can be stored about them
async function withData(auth: Auth, email: string) {
  brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
  await request(app)
    .post("/api/watchlist")
    .set(auth)
    .send({ orgNumber: ALTA_TOURS, note: "Boats for the summer" })
    .expect(201);

  const user = await userRecord(email);
  const company = await CompanyRecord.findOne({
    where: { orgNumber: ALTA_TOURS },
    rejectOnEmpty: true,
  });
  const change = await CompanyChange.create({
    companyId: company.id,
    field: "name",
    oldValue: "ALTA TOURS AS",
    newValue: "ALTA REISER AS",
    severity: "info",
    sourceUpdateId: null,
    detectedAt: new Date("2026-11-01T10:00:00Z"),
  });
  await Notification.create({
    userId: user.id,
    companyChangeId: change.id,
    readAt: null,
  });
  const conversation = await AssistantConversation.create({
    userId: user.id,
    title: "Risk",
  });
  await AssistantMessage.create({
    conversationId: conversation.id,
    role: "user",
    content: "Which company has the highest risk?",
    toolsUsed: [],
  });
  await AssistantMessage.create({
    conversationId: conversation.id,
    role: "assistant",
    content: "ALTA TOURS AS has low risk.",
    toolsUsed: ["list_watchlist"],
  });
  await AssistantUsage.create({ userId: user.id });
  await PasswordResetToken.create({
    userId: user.id,
    tokenHash: createHash("sha256").update(email).digest("hex"),
    expiresAt: new Date(Date.now() + 60_000),
  });
  return { user, company, change };
}

describe("account endpoints require a token", () => {
  it.each([
    ["post", "/api/auth/me/password"],
    ["get", "/api/auth/me/export"],
    ["delete", "/api/auth/me"],
  ] as const)("%s %s returns 401", async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/me/password", () => {
  it("changes the password and gives this device a new token", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/auth/me/password")
      .set(auth)
      .send({
        currentPassword: lukas.password,
        newPassword: "BrandNewPassword1",
      });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect((await logIn(lukas.email, "BrandNewPassword1")).status).toBe(200);
    expect((await logIn(lukas.email, lukas.password)).status).toBe(401);
    const me = await request(app)
      .get("/api/auth/me")
      .set({ Authorization: `Bearer ${res.body.token}` });
    expect(me.status).toBe(200);
  });

  it("ends every other session, even one from the same second", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-14T10:00:00.100Z"));
      const { auth: here } = await registerAndLogin(lukas);
      const other = await logIn(lukas.email, lukas.password);

      vi.setSystemTime(new Date("2026-11-14T10:00:00.500Z"));
      await request(app)
        .post("/api/auth/me/password")
        .set(here)
        .send({
          currentPassword: lukas.password,
          newPassword: "BrandNewPassword1",
        })
        .expect(200);

      const res = await request(app)
        .get("/api/auth/me")
        .set({ Authorization: `Bearer ${other.body.token}` });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("The password has changed. Log in again.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a wrong current password and keeps the old one", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/auth/me/password")
      .set(auth)
      .send({
        currentPassword: "WrongPassword1",
        newPassword: "BrandNewPassword1",
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("The password is wrong");
    expect((await logIn(lukas.email, lukas.password)).status).toBe(200);
  });

  it("refuses a short new password", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/auth/me/password")
      .set(auth)
      .send({ currentPassword: lukas.password, newPassword: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Password must be at least 8 characters");
  });

  it("is limited after too many wrong passwords", async () => {
    vi.stubEnv("PASSWORD_CHECK_FAILURES_PER_ACCOUNT", "2");
    const { auth } = await registerAndLogin({
      ...kari,
      email: "kari.limit@example.com",
    });
    const attempt = (currentPassword: string) =>
      request(app)
        .post("/api/auth/me/password")
        .set(auth)
        .send({ currentPassword, newPassword: "BrandNewPassword1" });

    await attempt("WrongPassword1").expect(401);
    await attempt("WrongPassword1").expect(401);
    const res = await attempt(kari.password);

    expect(res.status).toBe(429);
  });
});

describe("GET /api/auth/me/export", () => {
  it("downloads everything stored about the user as a JSON file", async () => {
    const { auth, userId } = await registerAndLogin(lukas);
    await withData(auth, lukas.email);

    const res = await request(app).get("/api/auth/me/export").set(auth);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.headers["content-disposition"]).toMatch(
      /^attachment; filename="?leverandorvakt-data-\d{4}-\d{2}-\d{2}\.json"?$/,
    );
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({
      format: "leverandorvakt-export/1",
      user: {
        userId,
        firstName: lukas.firstName,
        lastName: lukas.lastName,
        email: lukas.email,
        role: "user",
        passwordChangedAt: null,
        gettingStartedClosedAt: null,
      },
      watchlist: [
        {
          orgNumber: ALTA_TOURS,
          name: "ALTA TOURS AS",
          note: "Boats for the summer",
        },
      ],
      notifications: [
        {
          orgNumber: ALTA_TOURS,
          companyName: "ALTA TOURS AS",
          field: "name",
          oldValue: "ALTA TOURS AS",
          newValue: "ALTA REISER AS",
          severity: "info",
          detectedAt: "2026-11-01T10:00:00.000Z",
          readAt: null,
        },
      ],
      assistant: {
        conversations: [
          {
            title: "Risk",
            messages: [
              { role: "user", content: "Which company has the highest risk?" },
              {
                role: "assistant",
                content: "ALTA TOURS AS has low risk.",
                toolsUsed: ["list_watchlist"],
              },
            ],
          },
        ],
      },
    });
    expect(res.body.assistant.questionsAskedAt).toHaveLength(1);
    expect(res.body.notifications[0].notificationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("leaves out the password hash, internal ids and reset links", async () => {
    const { auth } = await registerAndLogin(lukas);
    const { user } = await withData(auth, lukas.email);

    const res = await request(app).get("/api/auth/me/export").set(auth);
    const text = JSON.stringify(res.body);

    expect(text).not.toContain(user.passwordHash);
    expect(text).not.toMatch(
      /"(id|userId|companyId|conversationId|companyChangeId)":\d/,
    );
    expect(text).not.toContain("tokenHash");
    expect(text).not.toContain(
      createHash("sha256").update(lukas.email).digest("hex"),
    );
  });

  it("holds only the user's own data", async () => {
    const lukasSession = await registerAndLogin(lukas);
    await withData(lukasSession.auth, lukas.email);
    const kariSession = await registerAndLogin(kari);

    const res = await request(app)
      .get("/api/auth/me/export")
      .set(kariSession.auth);

    expect(res.body.user.email).toBe(kari.email);
    expect(res.body.watchlist).toEqual([]);
    expect(res.body.notifications).toEqual([]);
    expect(res.body.assistant).toEqual({
      conversations: [],
      questionsAskedAt: [],
    });
  });

  it("returns 404 when the account no longer exists", async () => {
    const { auth, userId } = await registerAndLogin(lukas);
    await User.destroy({ where: { publicId: userId } });

    const res = await request(app).get("/api/auth/me/export").set(auth);

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/auth/me", () => {
  it("deletes the account and everything that belongs to it", async () => {
    const { auth } = await registerAndLogin(lukas);
    const { user } = await withData(auth, lukas.email);

    const res = await request(app)
      .delete("/api/auth/me")
      .set(auth)
      .send({ password: lukas.password });

    expect(res.status).toBe(204);
    expect(await User.count({ where: { id: user.id } })).toBe(0);
    for (const model of [
      WatchlistEntry,
      Notification,
      AssistantConversation,
      AssistantUsage,
      PasswordResetToken,
    ] as const) {
      expect(
        await (model as typeof WatchlistEntry).count({
          where: { userId: user.id },
        }),
      ).toBe(0);
    }
    expect(await AssistantMessage.count()).toBe(0);
    // The session cannot be used any more, and the email can log in no more
    expect((await request(app).get("/api/auth/me").set(auth)).status).toBe(404);
    expect((await logIn(lukas.email, lukas.password)).status).toBe(401);
  });

  it("keeps the company and other users' data", async () => {
    const lukasSession = await registerAndLogin(lukas);
    await withData(lukasSession.auth, lukas.email);
    const kariSession = await registerAndLogin(kari);
    await withData(kariSession.auth, kari.email);

    await request(app)
      .delete("/api/auth/me")
      .set(lukasSession.auth)
      .send({ password: lukas.password })
      .expect(204);

    const kariRecord = await userRecord(kari.email);
    expect(
      await CompanyRecord.count({ where: { orgNumber: ALTA_TOURS } }),
    ).toBe(1);
    expect(
      await WatchlistEntry.count({ where: { userId: kariRecord.id } }),
    ).toBe(1);
    expect(await Notification.count({ where: { userId: kariRecord.id } })).toBe(
      1,
    );
    expect(
      await AssistantConversation.count({ where: { userId: kariRecord.id } }),
    ).toBe(1);
    expect(await AssistantMessage.count()).toBe(2);
    const watchlist = await request(app)
      .get("/api/watchlist")
      .set(kariSession.auth);
    expect(watchlist.body).toHaveLength(1);
  });

  it("frees the email, so a new account can be made with it", async () => {
    const { auth } = await registerAndLogin(lukas);
    await request(app)
      .delete("/api/auth/me")
      .set(auth)
      .send({ password: lukas.password })
      .expect(204);

    const res = await request(app).post("/api/auth/register").send(lukas);

    expect(res.status).toBe(201);
  });

  it("refuses a wrong password and deletes nothing", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .delete("/api/auth/me")
      .set(auth)
      .send({ password: "WrongPassword1" });

    expect(res.status).toBe(401);
    expect(await User.count({ where: { email: lukas.email } })).toBe(1);
  });

  it("refuses without a password", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).delete("/api/auth/me").set(auth);

    expect(res.status).toBe(401);
    expect(await User.count({ where: { email: lukas.email } })).toBe(1);
  });

  it("never deletes the last admin, but another admin can go", async () => {
    await registerAndLogin(lukas);
    await User.update({ role: "admin" }, { where: { email: lukas.email } });
    const lukasAdmin = await logIn(lukas.email, lukas.password);
    const lukasAuth = { Authorization: `Bearer ${lukasAdmin.body.token}` };

    const refused = await request(app)
      .delete("/api/auth/me")
      .set(lukasAuth)
      .send({ password: lukas.password });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe("The last admin account cannot be deleted");

    await registerAndLogin(kari);
    await User.update({ role: "admin" }, { where: { email: kari.email } });
    const allowed = await request(app)
      .delete("/api/auth/me")
      .set(lukasAuth)
      .send({ password: lukas.password });
    expect(allowed.status).toBe(204);
  });
});

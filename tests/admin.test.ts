import { describe, expect, it, vi, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { ensureAdmin } from "../src/config/ensureAdmin.js";
import { User } from "../src/models/User.js";
import { BrregSyncState } from "../src/models/BrregSyncState.js";
import { CompanyRecord } from "../src/models/CompanyRecord.js";
import { CompanyChange } from "../src/models/CompanyChange.js";
import { Notification } from "../src/models/Notification.js";
import { AssistantConversation } from "../src/models/AssistantConversation.js";
import { AssistantUsage } from "../src/models/AssistantUsage.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, useFakeBrreg } from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const admin = {
  email: "admin@leverandorvakt.no",
  password: "AdminSecure2026",
  firstName: "Admin",
  lastName: "Leverandørvakt",
};

function setAdminEnv(overrides: Partial<typeof admin> = {}) {
  const values = { ...admin, ...overrides };
  vi.stubEnv("ADMIN_EMAIL", values.email);
  vi.stubEnv("ADMIN_PASSWORD", values.password);
  vi.stubEnv("ADMIN_FIRST_NAME", values.firstName);
  vi.stubEnv("ADMIN_LAST_NAME", values.lastName);
}

async function adminCount() {
  return User.count({ where: { role: "admin" } });
}

async function loginAsAdmin() {
  setAdminEnv();
  await ensureAdmin();
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: admin.email, password: admin.password })
    .expect(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ensureAdmin", () => {
  it("creates the admin from environment variables", async () => {
    setAdminEnv();

    await ensureAdmin();

    const created = await User.findOne({
      where: { email: admin.email },
      rejectOnEmpty: true,
    });
    expect(created.role).toBe("admin");
    expect(created.passwordHash).not.toBe(admin.password);
  });

  it("creates the admin only once, even when the email in .env changes", async () => {
    setAdminEnv();
    await ensureAdmin();
    await ensureAdmin();
    setAdminEnv({ email: "new.admin@leverandorvakt.no" });
    await ensureAdmin();

    expect(await adminCount()).toBe(1);
  });

  it("never turns an existing normal user into an admin", async () => {
    await registerAndLogin({ ...lukas, email: admin.email });
    setAdminEnv();

    await ensureAdmin();

    expect(await adminCount()).toBe(0);
    const existing = await User.findOne({
      where: { email: admin.email },
      rejectOnEmpty: true,
    });
    expect(existing.role).toBe("user");
  });

  it.each([
    ["the variables are missing", () => vi.stubEnv("ADMIN_EMAIL", "")],
    ["the password is too short", () => setAdminEnv({ password: "short" })],
  ])("creates no admin when %s", async (_case, arrange) => {
    setAdminEnv();
    arrange();

    await ensureAdmin();

    expect(await adminCount()).toBe(0);
  });

  it("gives the admin a token with the admin role", async () => {
    setAdminEnv();
    await ensureAdmin();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: admin.email, password: admin.password });

    expect(res.body.user.role).toBe("admin");
    expect((jwt.decode(res.body.token) as { role: string }).role).toBe("admin");
  });
});

describe("POST /api/admin/change-detection/run", () => {
  const path = "/api/admin/change-detection/run";

  it("returns 401 without a token", async () => {
    const res = await request(app).post(path);

    expect(res.status).toBe(401);
  });

  it("returns 403 for a normal user and does not run", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).post(path).set(auth);

    expect(res.status).toBe(403);
    expect(await BrregSyncState.count()).toBe(0);
  });

  it("runs change detection for an admin and returns the summary", async () => {
    const auth = await loginAsAdmin();

    const res = await request(app).post(path).set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      initialized: true,
      companiesChecked: 0,
      changesFound: 0,
      failedCompanies: 0,
    });
  });

  it("returns 409 when a run is already in progress", async () => {
    const auth = await loginAsAdmin();
    brreg.delayMs = 300;

    const [first, second] = await Promise.all([
      request(app).post(path).set(auth),
      new Promise((resolve) => setTimeout(resolve, 50)).then(() =>
        request(app).post(path).set(auth),
      ),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it("returns 502 when Brreg cannot be reached", async () => {
    const auth = await loginAsAdmin();
    vi.stubGlobal(
      "fetch",
      async () => new Response("", { status: 503, statusText: "Unavailable" }),
    );

    const res = await request(app).post(path).set(auth);

    expect(res.status).toBe(502);
  });
});

describe("POST /api/admin/accounts-check/run", () => {
  const path = "/api/admin/accounts-check/run";

  // A followed company whose accounts could not be fetched when it was
  // followed, so the accounts check has one company to do
  async function followCompanyWithUncheckedAccounts() {
    brreg.setActive(brregEnhet("912345678", "ALTA TOURS AS"));
    brreg.setAccountsError("912345678", 503, "Service Unavailable");
    const { auth } = await registerAndLogin(lukas);
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: "912345678" })
      .expect(201);
    brreg.accounts.delete("912345678");
  }

  it("returns 403 for a normal user", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).post(path).set(auth);

    expect(res.status).toBe(403);
  });

  it("runs the accounts check for an admin and returns the summary", async () => {
    const auth = await loginAsAdmin();
    await followCompanyWithUncheckedAccounts();

    const res = await request(app).post(path).set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      companiesChecked: 1,
      changesFound: 0,
      failedCompanies: 0,
    });
  });

  it("returns 409 when a run is already in progress", async () => {
    const auth = await loginAsAdmin();
    await followCompanyWithUncheckedAccounts();
    brreg.delayMs = 300;

    const [first, second] = await Promise.all([
      request(app).post(path).set(auth),
      new Promise((resolve) => setTimeout(resolve, 50)).then(() =>
        request(app).post(path).set(auth),
      ),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });
});

describe("GET /api/admin/status", () => {
  const path = "/api/admin/status";

  async function follow(auth: Record<string, string>, orgNumber: string) {
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber })
      .expect(201);
  }

  it("returns 401 without a token and 403 for a normal user", async () => {
    const { auth } = await registerAndLogin(lukas);

    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(path).set(auth)).status).toBe(403);
  });

  it("shows that change detection has not run yet on a new system", async () => {
    const auth = await loginAsAdmin();

    const res = await request(app).get(path).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.changeDetection).toEqual({
      running: false,
      initialized: false,
      lastRunAt: null,
      lastUpdateId: null,
      lastRoleEventId: null,
    });
    expect(res.body.accountsCheck).toEqual({
      running: false,
      lastCompanyCheckedAt: null,
      companiesDue: 0,
    });
    expect(res.body.users).toEqual({ total: 1, admins: 1 });
  });

  it("shows where change detection stopped after a run", async () => {
    const auth = await loginAsAdmin();
    await request(app)
      .post("/api/admin/change-detection/run")
      .set(auth)
      .expect(200);
    const state = await BrregSyncState.findOne({ rejectOnEmpty: true });

    const res = await request(app).get(path).set(auth);

    expect(res.body.changeDetection.initialized).toBe(true);
    expect(res.body.changeDetection.lastUpdateId).toBe(state.lastUpdateId);
    expect(res.body.changeDetection.lastRunAt).toBe(
      state.lastRunAt?.toISOString(),
    );
  });

  it("counts users, companies, risk levels, notifications and assistant use", async () => {
    const auth = await loginAsAdmin();
    brreg.setActive(brregEnhet("912345678", "ALTA TOURS AS"));
    brreg.setActive(brregEnhet("923456789", "NORDLYS BYGG AS"));
    brreg.setActive(brregEnhet("934567890", "FJORD DATA AS"));
    const lukasUser = await registerAndLogin(lukas);
    const kariUser = await registerAndLogin(kari);
    await follow(lukasUser.auth, "912345678");
    await follow(lukasUser.auth, "923456789");
    await follow(kariUser.auth, "912345678");
    await follow(kariUser.auth, "934567890");
    await request(app)
      .delete("/api/watchlist/934567890")
      .set(kariUser.auth)
      .expect(204);

    // Set the states directly, so the counts do not depend on the risk rules
    await CompanyRecord.update(
      { riskLevel: "high" },
      { where: { orgNumber: "912345678" } },
    );
    await CompanyRecord.update(
      { riskLevel: null, deletedFromRegistryAt: new Date() },
      { where: { orgNumber: "923456789" } },
    );
    await CompanyRecord.update(
      { riskLevel: "low" },
      { where: { orgNumber: "934567890" } },
    );

    const company = await CompanyRecord.findOne({
      where: { orgNumber: "912345678" },
      rejectOnEmpty: true,
    });
    const change = await CompanyChange.create({
      companyId: company.id,
      field: "name",
      oldValue: "ALTA TOURS AS",
      newValue: "ALTA REISER AS",
      severity: "info",
      sourceUpdateId: null,
      detectedAt: new Date(),
    });
    const lukasRecord = await User.findOne({
      where: { email: lukas.email },
      rejectOnEmpty: true,
    });
    const kariRecord = await User.findOne({
      where: { email: kari.email },
      rejectOnEmpty: true,
    });
    await Notification.create({
      userId: lukasRecord.id,
      companyChangeId: change.id,
      readAt: new Date(),
    });
    await Notification.create({
      userId: kariRecord.id,
      companyChangeId: change.id,
      readAt: null,
    });

    await AssistantConversation.create({
      userId: lukasRecord.id,
      title: "Risk",
    });
    await AssistantUsage.create({ userId: lukasRecord.id });
    const old = await AssistantUsage.create({ userId: lukasRecord.id });
    await AssistantUsage.update(
      { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      { where: { id: old.id }, silent: true },
    );

    const res = await request(app).get(path).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual({ total: 3, admins: 1 });
    expect(res.body.companies).toEqual({
      total: 3,
      followed: 2,
      struckOff: 1,
      riskLevels: { low: 1, medium: 0, high: 1, notAssessed: 1 },
    });
    expect(res.body.watchlistEntries).toBe(3);
    expect(res.body.notifications).toEqual({ total: 2, unread: 1 });
    expect(res.body.assistant).toMatchObject({
      conversations: 1,
      questionsLast24Hours: 1,
    });
  });

  it("counts companies due for an accounts check, but not struck-off ones", async () => {
    const auth = await loginAsAdmin();
    brreg.setActive(brregEnhet("912345678", "ALTA TOURS AS"));
    brreg.setActive(brregEnhet("923456789", "NORDLYS BYGG AS"));
    brreg.setActive(brregEnhet("934567890", "FJORD DATA AS"));
    const { auth: userAuth } = await registerAndLogin(lukas);
    await follow(userAuth, "912345678");
    await follow(userAuth, "923456789");
    await follow(userAuth, "934567890");

    const checkedRecently = new Date(Date.now() - 60 * 60 * 1000);
    const checkedLongAgo = new Date(Date.now() - 21 * 60 * 60 * 1000);
    await CompanyRecord.update(
      { accountsCheckedAt: checkedRecently },
      { where: { orgNumber: "912345678" } },
    );
    await CompanyRecord.update(
      { accountsCheckedAt: checkedLongAgo },
      { where: { orgNumber: "923456789" } },
    );
    await CompanyRecord.update(
      { accountsCheckedAt: null, deletedFromRegistryAt: new Date() },
      { where: { orgNumber: "934567890" } },
    );

    const res = await request(app).get(path).set(auth);

    expect(res.body.accountsCheck).toEqual({
      running: false,
      lastCompanyCheckedAt: checkedRecently.toISOString(),
      companiesDue: 1,
    });
  });

  it("shows a run that is in progress", async () => {
    const auth = await loginAsAdmin();
    brreg.delayMs = 300;

    const [, status] = await Promise.all([
      request(app).post("/api/admin/change-detection/run").set(auth),
      new Promise((resolve) => setTimeout(resolve, 50)).then(() =>
        request(app).get(path).set(auth),
      ),
    ]);

    expect(status.body.changeDetection.running).toBe(true);
    expect(status.body.accountsCheck.running).toBe(false);
  });

  it("shows the assistant provider, or null when it is turned off", async () => {
    const auth = await loginAsAdmin();

    vi.stubEnv("AI_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_MODEL", "test-model");
    const on = await request(app).get(path).set(auth);
    vi.stubEnv("AI_PROVIDER", "");
    const off = await request(app).get(path).set(auth);

    expect(on.body.assistant.provider).toBe("ollama:test-model");
    expect(off.body.assistant.provider).toBeNull();
  });
});

describe("GET /api/admin/users", () => {
  const path = "/api/admin/users";

  it("returns 403 for a normal user", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).get(path).set(auth);

    expect(res.status).toBe(403);
  });

  it("lists users newest first with their number of followed companies", async () => {
    const auth = await loginAsAdmin();
    brreg.setActive(brregEnhet("912345678", "ALTA TOURS AS"));
    brreg.setActive(brregEnhet("923456789", "NORDLYS BYGG AS"));
    const lukasUser = await registerAndLogin(lukas);
    await registerAndLogin(kari);
    for (const orgNumber of ["912345678", "923456789"]) {
      await request(app)
        .post("/api/watchlist")
        .set(lukasUser.auth)
        .send({ orgNumber })
        .expect(201);
    }

    const res = await request(app).get(path).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(3);
    expect(res.body.items.map((u: { email: string }) => u.email)).toEqual([
      kari.email,
      lukas.email,
      admin.email,
    ]);
    const lukasItem = res.body.items[1];
    expect(lukasItem).toEqual({
      userId: lukasUser.userId,
      firstName: lukas.firstName,
      lastName: lukas.lastName,
      email: lukas.email,
      role: "user",
      createdAt: expect.any(String),
      lastLoginAt: expect.any(String),
      followedCompanies: 2,
    });
    expect(res.body.items[0].followedCompanies).toBe(0);
    expect(res.body.items[2].role).toBe("admin");
  });

  it("never returns password hashes or internal ids", async () => {
    const auth = await loginAsAdmin();
    await registerAndLogin(lukas);

    const res = await request(app).get(path).set(auth);

    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
    for (const item of res.body.items) {
      expect(item).not.toHaveProperty("id");
    }
  });

  it("pages through the users", async () => {
    const auth = await loginAsAdmin();
    await registerAndLogin(lukas);
    await registerAndLogin(kari);

    const res = await request(app)
      .get(path)
      .query({ page: 2, pageSize: 2 })
      .set(auth);

    expect(res.body.totalItems).toBe(3);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].email).toBe(admin.email);
  });

  // Name and email share no text, so each search proves one column
  const ingrid = {
    firstName: "Ingrid",
    lastName: "Solberg",
    email: "post@example.com",
    password: "IngridSecure2026",
  };

  it.each([
    ["part of an email", "WEBER@exam", [lukas.email]],
    ["a first name", "ingrid", [ingrid.email]],
    ["a last name", "SOLBERG", [ingrid.email]],
    ["text with no match", "nobody", []],
    ["a % sign, as plain text", "%", []],
  ])("searches by %s", async (_case, q, expected) => {
    const auth = await loginAsAdmin();
    await registerAndLogin(lukas);
    await registerAndLogin(ingrid);

    const res = await request(app).get(path).query({ q }).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.items.map((u: { email: string }) => u.email)).toEqual(
      expected,
    );
    expect(res.body.totalItems).toBe(expected.length);
  });

  it.each([
    ["pageSize is too large", { pageSize: 1000 }],
    ["q is too long", { q: "a".repeat(101) }],
    ["q is given twice", "q=a&q=b"],
  ])("returns 400 when %s", async (_case, query) => {
    const auth = await loginAsAdmin();

    const res = await request(app).get(path).query(query).set(auth);

    expect(res.status).toBe(400);
  });
});

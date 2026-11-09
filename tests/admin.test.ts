import { describe, expect, it, vi, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { ensureAdmin } from "../src/config/ensureAdmin.js";
import { User } from "../src/models/User.js";
import { BrregSyncState } from "../src/models/BrregSyncState.js";
import { lukas, registerAndLogin } from "./helpers/users.js";
import { useFakeBrreg } from "./helpers/fakeBrreg.js";

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

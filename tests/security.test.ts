import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import {
  kari as kariTemplate,
  lukas as lukasTemplate,
  registerAndLogin,
} from "./helpers/users.js";

// The counts live in the API's memory, not in the database, so they are
// not emptied between tests. Each test therefore uses its own users and
// sends its requests as its own client addresses (through X-Forwarded-For,
// which the API trusts from this machine).
let nextAddress = 1;
function newAddress(): string {
  return `203.0.113.${nextAddress++}`;
}

let lukas = lukasTemplate;
let kari = kariTemplate;
let nextUser = 1;
beforeEach(() => {
  const n = nextUser++;
  lukas = { ...lukasTemplate, email: `lukas.${n}@example.com` };
  kari = { ...kariTemplate, email: `kari.${n}@example.com` };
});

function loginFrom(address: string, email: string, password: string) {
  return request(app)
    .post("/api/auth/login")
    .set("X-Forwarded-For", address)
    .send({ email, password });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("security headers", () => {
  it("are sent with every answer, without telling that it is Express", async () => {
    const res = await request(app).get("/");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-security-policy"]).toContain(
      "default-src 'self'",
    );
    expect(res.headers["content-security-policy"]).toContain(
      "frame-ancestors 'self'",
    );
    expect(res.headers).not.toHaveProperty("x-powered-by");
  });

  it("are also sent with errors", async () => {
    const res = await request(app).get("/api/watchlist");

    expect(res.status).toBe(401);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("failed logins per account", () => {
  it("are refused after the limit, from any address, even with the right password", async () => {
    vi.stubEnv("LOGIN_FAILURES_PER_ACCOUNT", "3");
    await registerAndLogin(lukas);

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await loginFrom(newAddress(), lukas.email, "WrongPassword1");
      expect(res.status).toBe(401);
    }
    const blocked = await loginFrom(newAddress(), lukas.email, lukas.password);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe(
      "Too many failed login attempts. Try again later.",
    );
    expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.body.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.headers["ratelimit-policy"]).toContain("q=3");
  });

  it("count the same account however the email is written", async () => {
    vi.stubEnv("LOGIN_FAILURES_PER_ACCOUNT", "2");
    await registerAndLogin(lukas);
    const address = newAddress();

    await loginFrom(address, lukas.email.toUpperCase(), "WrongPassword1");
    await loginFrom(address, `  ${lukas.email}  `, "WrongPassword1");
    const res = await loginFrom(address, lukas.email, lukas.password);

    expect(res.status).toBe(429);
  });

  it("do not stop other accounts", async () => {
    vi.stubEnv("LOGIN_FAILURES_PER_ACCOUNT", "2");
    await registerAndLogin(lukas);
    await registerAndLogin(kari);
    const address = newAddress();
    await loginFrom(address, lukas.email, "WrongPassword1");
    await loginFrom(address, lukas.email, "WrongPassword1");

    const res = await loginFrom(address, kari.email, kari.password);

    expect(res.status).toBe(200);
  });

  it("are the only ones counted: successful logins never use up the limit", async () => {
    vi.stubEnv("LOGIN_FAILURES_PER_ACCOUNT", "2");
    await registerAndLogin(lukas);
    const address = newAddress();

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await loginFrom(address, lukas.email, lukas.password);
      expect(res.status).toBe(200);
    }
  });
});

describe("failed logins per address", () => {
  it("are refused after the limit for any account, but other addresses go on", async () => {
    vi.stubEnv("LOGIN_FAILURES_PER_ADDRESS", "3");
    await registerAndLogin(kari);
    const attacker = newAddress();

    for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
      const res = await loginFrom(attacker, email, "Password123");
      expect(res.status).toBe(401);
    }
    const blocked = await loginFrom(attacker, kari.email, kari.password);
    const other = await loginFrom(newAddress(), kari.email, kari.password);

    expect(blocked.status).toBe(429);
    expect(other.status).toBe(200);
  });
});

describe("new accounts per address", () => {
  it("are refused after the limit, but other addresses go on", async () => {
    vi.stubEnv("REGISTRATIONS_PER_ADDRESS", "2");
    const address = newAddress();
    const register = (from: string, email: string) =>
      request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", from)
        .send({ ...lukas, email });

    expect((await register(address, "one@example.com")).status).toBe(201);
    expect((await register(address, "two@example.com")).status).toBe(201);
    const blocked = await register(address, "three@example.com");
    const other = await register(newAddress(), "three@example.com");

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe(
      "Too many new accounts from this address. Try again later.",
    );
    expect(other.status).toBe(201);
  });
});

describe("requests per address", () => {
  it("are refused after the limit for every API path", async () => {
    vi.stubEnv("REQUESTS_PER_ADDRESS", "3");
    const address = newAddress();

    for (let call = 0; call < 3; call++) {
      const res = await request(app)
        .get("/api/watchlist")
        .set("X-Forwarded-For", address);
      expect(res.status).toBe(401);
    }
    const blocked = await request(app)
      .get("/api/companies/search?name=test")
      .set("X-Forwarded-For", address);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("Too many requests. Try again later.");
  });

  it("leave the API's front page and docs alone", async () => {
    vi.stubEnv("REQUESTS_PER_ADDRESS", "1");
    const address = newAddress();

    for (let call = 0; call < 3; call++) {
      const res = await request(app).get("/").set("X-Forwarded-For", address);
      expect(res.status).toBe(200);
    }
  });
});

describe("client addresses", () => {
  it("are read from X-Forwarded-For only behind this machine or a private network", () => {
    const trusted = app.get("trust proxy fn") as (
      address: string,
      hop: number,
    ) => boolean;

    // The web app on the same machine, or in Docker's network
    expect(trusted("127.0.0.1", 0)).toBe(true);
    expect(trusted("::1", 0)).toBe(true);
    expect(trusted("172.18.0.3", 0)).toBe(true);
    expect(trusted("10.0.0.5", 0)).toBe(true);
    // Anyone on the internet: their own X-Forwarded-For is ignored
    expect(trusted("203.0.113.9", 0)).toBe(false);
    expect(trusted("8.8.8.8", 0)).toBe(false);
  });
});

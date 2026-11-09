import { describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { kari, registerAndLogin } from "./helpers/users.js";

const UUID_PATTERN = /^[0-9a-f-]{36}$/;

describe("POST /api/auth/register", () => {
  it("creates a user and returns only public data", async () => {
    const res = await request(app).post("/api/auth/register").send(kari);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      firstName: "Kari",
      lastName: "Nordmann",
      email: "kari.nordmann@example.com",
      role: "user",
      lastLoginAt: null,
    });
    expect(res.body.userId).toMatch(UUID_PATTERN);
    // The internal id and the password hash must never be sent
    expect(res.body).not.toHaveProperty("id");
    expect(res.body).not.toHaveProperty("passwordHash");
  });

  it("stores the password as a bcrypt hash", async () => {
    await request(app).post("/api/auth/register").send(kari);

    const user = await User.findOne({ where: { email: kari.email } });
    expect(user?.passwordHash).not.toBe(kari.password);
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("stores the email trimmed and in lower case", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...kari, email: "  Kari.Nordmann@Example.COM " });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("kari.nordmann@example.com");
  });

  it("ignores a role sent by the client", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...kari, role: "admin" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("user");
  });

  it("rejects an email that is already registered, regardless of case", async () => {
    await request(app).post("/api/auth/register").send(kari);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...kari, email: "KARI.NORDMANN@example.com" });

    expect(res.status).toBe(409);
  });

  it.each([
    ["first name is missing", { firstName: undefined }],
    ["last name is blank", { lastName: "   " }],
    ["name is too long", { firstName: "a".repeat(101) }],
    ["email is invalid", { email: "not-an-email" }],
    ["password is too short", { password: "short" }],
  ])("returns 400 when %s", async (_case, override) => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...kari, ...override });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("returns a token and the user, and records the login time", async () => {
    await request(app).post("/api/auth/register").send(kari);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: kari.email, password: kari.password });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.email).toBe(kari.email);
    expect(res.body.user.lastLoginAt).not.toBeNull();
  });

  it("puts the public user id and role in the token, not the internal id", async () => {
    const { token, userId } = await registerAndLogin(kari);

    const payload = jwt.decode(token) as { sub: string; role: string };
    expect(payload.sub).toBe(userId);
    expect(payload.role).toBe("user");
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    await request(app).post("/api/auth/register").send(kari);

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: kari.email, password: "WrongPassword1" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: kari.password });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it("returns 400 when email or password is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: kari.email });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the logged-in user's profile", async () => {
    const { auth, userId } = await registerAndLogin(kari);

    const res = await request(app).get("/api/auth/me").set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId,
      email: kari.email,
      firstName: "Kari",
    });
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
  });

  it("returns 401 for a token that has been tampered with", async () => {
    const { token } = await registerAndLogin(kari);

    const res = await request(app)
      .get("/api/auth/me")
      .set({ Authorization: `Bearer ${token}x` });

    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const { userId } = await registerAndLogin(kari);
    const expired = jwt.sign(
      { sub: userId, role: "user" },
      process.env.JWT_SECRET!,
      {
        expiresIn: -10,
      },
    );

    const res = await request(app)
      .get("/api/auth/me")
      .set({ Authorization: `Bearer ${expired}` });

    expect(res.status).toBe(401);
  });

  it("returns 404 when the account no longer exists", async () => {
    const { auth } = await registerAndLogin(kari);
    await User.destroy({ where: { email: kari.email } });

    const res = await request(app).get("/api/auth/me").set(auth);

    expect(res.status).toBe(404);
  });
});

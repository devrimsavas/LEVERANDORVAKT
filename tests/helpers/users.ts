import request from "supertest";
import app from "../../src/app.js";

export interface TestUserInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export const kari: TestUserInput = {
  firstName: "Kari",
  lastName: "Nordmann",
  email: "kari.nordmann@example.com",
  password: "KariSecure2026",
};

export const lukas: TestUserInput = {
  firstName: "Lukas",
  lastName: "Weber",
  email: "lukas.weber@example.com",
  password: "LukasSecure2026",
};

// Registers and logs in a user through the API.
// Returns the token and the Authorization header to send with requests.
export async function registerAndLogin(user: TestUserInput) {
  await request(app).post("/api/auth/register").send(user).expect(201);

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: user.email, password: user.password })
    .expect(200);

  const token: string = res.body.token;
  return {
    token,
    userId: res.body.user.userId as string,
    auth: { Authorization: `Bearer ${token}` },
  };
}

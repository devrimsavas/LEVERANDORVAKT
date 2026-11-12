import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, useFakeBrreg } from "./helpers/fakeBrreg.js";
import { useFakeOllama } from "./helpers/fakeLlm.js";

const brreg = useFakeBrreg();
const ollama = useFakeOllama(brreg);

const ALTA_TOURS = "912345678";

type Auth = Record<string, string>;

function getOnboarding(auth: Auth) {
  return request(app).get("/api/auth/me/onboarding").set(auth);
}

function follow(auth: Auth, note?: string) {
  brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
  return request(app)
    .post("/api/watchlist")
    .set(auth)
    .send({ orgNumber: ALTA_TOURS, ...(note === undefined ? {} : { note }) })
    .expect(201);
}

describe("onboarding endpoints require a token", () => {
  it.each([
    ["get", "/api/auth/me/onboarding"],
    ["post", "/api/auth/me/onboarding/dismiss"],
  ] as const)("%s %s returns 401", async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me/onboarding", () => {
  it("starts with no steps done and the list open", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await getOnboarding(auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      steps: { followCompany: false, writeNote: false, askAssistant: false },
      completed: false,
      dismissedAt: null,
    });
  });

  it("marks following a company, but not a note, when none was written", async () => {
    const { auth } = await registerAndLogin(lukas);
    await follow(auth);

    const res = await getOnboarding(auth);

    expect(res.body.steps).toEqual({
      followCompany: true,
      writeNote: false,
      askAssistant: false,
    });
  });

  it("marks the note once one is saved, and not for an empty note", async () => {
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, "   ");
    expect((await getOnboarding(auth)).body.steps.writeNote).toBe(false);

    await request(app)
      .patch(`/api/watchlist/${ALTA_TOURS}`)
      .set(auth)
      .send({ note: "Main supplier of boats" })
      .expect(200);

    expect((await getOnboarding(auth)).body.steps.writeNote).toBe(true);
  });

  it("marks asking the assistant, and keeps it after the conversation is deleted", async () => {
    const { auth } = await registerAndLogin(lukas);
    ollama.reply("Hello!");
    const asked = await request(app)
      .post("/api/assistant/messages")
      .set(auth)
      .send({ message: "Hi" })
      .expect(200);

    expect((await getOnboarding(auth)).body.steps.askAssistant).toBe(true);

    await request(app)
      .delete(`/api/assistant/conversations/${asked.body.conversationId}`)
      .set(auth)
      .expect(204);
    expect((await getOnboarding(auth)).body.steps.askAssistant).toBe(true);
  });

  it("is completed when all three steps are done", async () => {
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, "Main supplier");
    ollama.reply("Hello!");
    await request(app)
      .post("/api/assistant/messages")
      .set(auth)
      .send({ message: "Hi" })
      .expect(200);

    const res = await getOnboarding(auth);

    expect(res.body).toMatchObject({
      steps: { followCompany: true, writeNote: true, askAssistant: true },
      completed: true,
    });
  });

  it("counts only the user's own data", async () => {
    const lukasSession = await registerAndLogin(lukas);
    const kariSession = await registerAndLogin(kari);
    await follow(lukasSession.auth, "Main supplier");
    ollama.reply("Hello!");
    await request(app)
      .post("/api/assistant/messages")
      .set(lukasSession.auth)
      .send({ message: "Hi" })
      .expect(200);

    const res = await getOnboarding(kariSession.auth);

    expect(res.body.steps).toEqual({
      followCompany: false,
      writeNote: false,
      askAssistant: false,
    });
  });

  it("returns 404 when the account no longer exists", async () => {
    const { auth, userId } = await registerAndLogin(lukas);
    await User.destroy({ where: { publicId: userId } });

    const res = await getOnboarding(auth);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/auth/me/onboarding/dismiss", () => {
  it("closes the list and keeps it closed", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/auth/me/onboarding/dismiss")
      .set(auth);

    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(false);
    expect(new Date(res.body.dismissedAt).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
    expect((await getOnboarding(auth)).body.dismissedAt).toBe(
      res.body.dismissedAt,
    );
  });

  it("keeps the first time when closed again", async () => {
    const { auth } = await registerAndLogin(lukas);
    const first = await request(app)
      .post("/api/auth/me/onboarding/dismiss")
      .set(auth)
      .expect(200);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = await request(app)
      .post("/api/auth/me/onboarding/dismiss")
      .set(auth)
      .expect(200);

    expect(second.body.dismissedAt).toBe(first.body.dismissedAt);
  });

  it("closes the list only for that user", async () => {
    const lukasSession = await registerAndLogin(lukas);
    const kariSession = await registerAndLogin(kari);
    await request(app)
      .post("/api/auth/me/onboarding/dismiss")
      .set(lukasSession.auth)
      .expect(200);

    expect((await getOnboarding(kariSession.auth)).body.dismissedAt).toBeNull();
  });

  it("returns 404 when the account no longer exists", async () => {
    const { auth, userId } = await registerAndLogin(lukas);
    await User.destroy({ where: { publicId: userId } });

    const res = await request(app)
      .post("/api/auth/me/onboarding/dismiss")
      .set(auth);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/auth/me", () => {
  it("does not show the onboarding field in the public user", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).get("/api/auth/me").set(auth).expect(200);

    expect(res.body).not.toHaveProperty("onboardingDismissedAt");
  });
});

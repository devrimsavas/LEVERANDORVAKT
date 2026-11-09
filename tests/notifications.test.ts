import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { runChangeDetection } from "../src/services/changeDetectionService.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, useFakeBrreg } from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

interface NotificationBody {
  id: string;
  readAt: string | null;
  change: { field: string };
}

// Lukas and Kari follow Alta Tours. The company then goes bankrupt, is put into
// liquidation and changes its name, so each of them gets three notifications.
async function setUpThreeNotificationsEach() {
  brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
  const lukasSession = await registerAndLogin(lukas);
  const kariSession = await registerAndLogin(kari);
  for (const session of [lukasSession, kariSession]) {
    await request(app)
      .post("/api/watchlist")
      .set(session.auth)
      .send({ orgNumber: ALTA_TOURS })
      .expect(201);
  }
  await runChangeDetection();

  brreg.setActive(
    brregEnhet(ALTA_TOURS, "ALTA TOURS KONKURSBO", {
      konkurs: true,
      underAvvikling: true,
    }),
  );
  brreg.addUpdate(ALTA_TOURS);
  await runChangeDetection();

  return { lukasAuth: lukasSession.auth, kariAuth: kariSession.auth };
}

async function listNotifications(auth: Record<string, string>, query = "") {
  const res = await request(app).get(`/api/notifications${query}`).set(auth);
  return res.body.items as NotificationBody[];
}

describe("notification endpoints require a token", () => {
  it.each([
    ["get", "/api/notifications"],
    ["get", "/api/notifications/unread-count"],
    ["post", "/api/notifications/read-all"],
    ["patch", `/api/notifications/${UNKNOWN_ID}/read`],
  ] as const)("%s %s returns 401", async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/notifications", () => {
  it("lists the user's notifications with the company and the change", async () => {
    const { lukasAuth } = await setUpThreeNotificationsEach();

    const res = await request(app).get("/api/notifications").set(lukasAuth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 1,
      pageSize: 20,
      totalItems: 3,
      totalPages: 1,
    });
    expect(
      res.body.items.map((n: NotificationBody) => n.change.field).sort(),
    ).toEqual(["isBankrupt", "isUnderLiquidation", "name"]);
    const bankruptcy = res.body.items.find(
      (n: NotificationBody) => n.change.field === "isBankrupt",
    );
    expect(bankruptcy).toMatchObject({
      readAt: null,
      company: { orgNumber: ALTA_TOURS, name: "ALTA TOURS KONKURSBO" },
      change: { oldValue: false, newValue: true, severity: "critical" },
    });
    // Only public identifiers are sent
    expect(bankruptcy).not.toHaveProperty("userId");
    expect(bankruptcy).not.toHaveProperty("companyChangeId");
  });

  it("returns only unread notifications with ?unread=true", async () => {
    const { lukasAuth } = await setUpThreeNotificationsEach();
    const [first] = await listNotifications(lukasAuth);
    await request(app)
      .patch(`/api/notifications/${first!.id}/read`)
      .set(lukasAuth)
      .expect(200);

    const unread = await listNotifications(lukasAuth, "?unread=true");
    const all = await listNotifications(lukasAuth, "?unread=false");

    expect(unread).toHaveLength(2);
    expect(unread.map((n) => n.id)).not.toContain(first!.id);
    expect(all).toHaveLength(3);
  });

  it("splits the list into pages", async () => {
    const { lukasAuth } = await setUpThreeNotificationsEach();

    const res = await request(app)
      .get("/api/notifications?page=2&pageSize=2")
      .set(lukasAuth);

    expect(res.body).toMatchObject({
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
    expect(res.body.items).toHaveLength(1);
  });

  it.each([
    ["unread is not true or false", "?unread=yes"],
    ["pageSize is 0", "?pageSize=0"],
  ])("returns 400 when %s", async (_case, query) => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).get(`/api/notifications${query}`).set(auth);

    expect(res.status).toBe(400);
  });

  it("returns an empty page for a user without notifications", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).get("/api/notifications").set(auth);

    expect(res.body).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
    });
  });
});

describe("GET /api/notifications/unread-count", () => {
  it("counts only the user's unread notifications", async () => {
    const { lukasAuth } = await setUpThreeNotificationsEach();
    const [first] = await listNotifications(lukasAuth);
    await request(app)
      .patch(`/api/notifications/${first!.id}/read`)
      .set(lukasAuth);

    const res = await request(app)
      .get("/api/notifications/unread-count")
      .set(lukasAuth);

    expect(res.body).toEqual({ count: 2 });
  });
});

describe("PATCH /api/notifications/:id/read", () => {
  it("marks a notification as read and keeps the first read time", async () => {
    const { lukasAuth } = await setUpThreeNotificationsEach();
    const [first] = await listNotifications(lukasAuth);

    const firstRead = await request(app)
      .patch(`/api/notifications/${first!.id}/read`)
      .set(lukasAuth);
    const secondRead = await request(app)
      .patch(`/api/notifications/${first!.id}/read`)
      .set(lukasAuth);

    expect(firstRead.status).toBe(200);
    expect(firstRead.body.readAt).not.toBeNull();
    expect(secondRead.body.readAt).toBe(firstRead.body.readAt);
  });

  it("returns 404 for another user's notification and leaves it unread", async () => {
    const { lukasAuth, kariAuth } = await setUpThreeNotificationsEach();
    const [kariNotification] = await listNotifications(kariAuth);

    const res = await request(app)
      .patch(`/api/notifications/${kariNotification!.id}/read`)
      .set(lukasAuth);

    expect(res.status).toBe(404);
    const kariUnread = await request(app)
      .get("/api/notifications/unread-count")
      .set(kariAuth);
    expect(kariUnread.body.count).toBe(3);
  });

  it("returns 404 for an id that does not exist", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .patch(`/api/notifications/${UNKNOWN_ID}/read`)
      .set(auth);

    expect(res.status).toBe(404);
  });

  it("returns 400 when the id is not a UUID", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .patch("/api/notifications/123/read")
      .set(auth);

    expect(res.status).toBe(400);
  });
});

describe("POST /api/notifications/read-all", () => {
  it("marks all of the user's notifications as read, and only theirs", async () => {
    const { lukasAuth, kariAuth } = await setUpThreeNotificationsEach();
    const [first] = await listNotifications(lukasAuth);
    await request(app)
      .patch(`/api/notifications/${first!.id}/read`)
      .set(lukasAuth);

    const res = await request(app)
      .post("/api/notifications/read-all")
      .set(lukasAuth);

    expect(res.body).toEqual({ updated: 2 });
    expect(
      (await request(app).get("/api/notifications/unread-count").set(lukasAuth))
        .body.count,
    ).toBe(0);
    expect(
      (await request(app).get("/api/notifications/unread-count").set(kariAuth))
        .body.count,
    ).toBe(3);
  });
});

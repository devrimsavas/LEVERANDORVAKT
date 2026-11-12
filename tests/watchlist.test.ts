import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { CompanyRecord } from "../src/models/CompanyRecord.js";
import { CompanyChange } from "../src/models/CompanyChange.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, useFakeBrreg } from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";
const NORTH_FISH = "923456789";

function companyLookups(orgNumber: string) {
  return brreg.requests.filter((url) =>
    url.pathname.endsWith(`/enheter/${orgNumber}`),
  ).length;
}

describe("watchlist endpoints require a token", () => {
  it.each([
    ["get", "/api/watchlist"],
    ["post", "/api/watchlist"],
    ["get", `/api/watchlist/${ALTA_TOURS}`],
    ["patch", `/api/watchlist/${ALTA_TOURS}`],
    ["delete", `/api/watchlist/${ALTA_TOURS}`],
    ["get", `/api/watchlist/${ALTA_TOURS}/changes`],
  ] as const)("%s %s returns 401", async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/watchlist", () => {
  it("follows a company and stores its current state from Brreg", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS, note: "  Main tour partner  " });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      orgNumber: ALTA_TOURS,
      name: "ALTA TOURS AS",
      note: "Main tour partner",
      lastChangedAt: null,
      deletedFromRegistryAt: null,
      company: {
        orgNumber: ALTA_TOURS,
        isBankrupt: false,
        address: { city: "ALTA" },
      },
    });
  });

  it("stores a company once and asks Brreg once, even when several users follow it", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const lukasSession = await registerAndLogin(lukas);
    const kariSession = await registerAndLogin(kari);

    await request(app)
      .post("/api/watchlist")
      .set(lukasSession.auth)
      .send({ orgNumber: ALTA_TOURS });
    await request(app)
      .post("/api/watchlist")
      .set(kariSession.auth)
      .send({ orgNumber: ALTA_TOURS });

    expect(await CompanyRecord.count()).toBe(1);
    expect(companyLookups(ALTA_TOURS)).toBe(1);
  });

  it("returns 409 when the company is already on the watchlist", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS });

    const res = await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS });

    expect(res.status).toBe(409);
  });

  it("returns 404 for a company that does not exist in Brreg", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS });

    expect(res.status).toBe(404);
  });

  it("returns 404 for a company that has been struck off", async () => {
    brreg.setDeleted(ALTA_TOURS, "2026-11-08");
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS });

    expect(res.status).toBe(404);
    expect(await CompanyRecord.count()).toBe(0);
  });

  it("returns 502 when Brreg is not available", async () => {
    brreg.setError(ALTA_TOURS, 503);
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS });

    expect(res.status).toBe(502);
  });

  it.each([
    ["the organization number is not 9 digits", { orgNumber: "12345" }],
    ["the organization number is missing", {}],
    ["the note is too long", { orgNumber: ALTA_TOURS, note: "a".repeat(501) }],
    ["the note is not text", { orgNumber: ALTA_TOURS, note: 42 }],
  ])("returns 400 when %s", async (_case, body) => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).post("/api/watchlist").set(auth).send(body);

    expect(res.status).toBe(400);
    expect(companyLookups(ALTA_TOURS)).toBe(0);
  });
});

describe("GET /api/watchlist", () => {
  it("lists only the user's own companies, sorted by name", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    brreg.setActive(brregEnhet(NORTH_FISH, "ARCTIC FISH AS"));
    const lukasSession = await registerAndLogin(lukas);
    const kariSession = await registerAndLogin(kari);
    await request(app)
      .post("/api/watchlist")
      .set(lukasSession.auth)
      .send({ orgNumber: ALTA_TOURS });
    await request(app)
      .post("/api/watchlist")
      .set(lukasSession.auth)
      .send({ orgNumber: NORTH_FISH });
    await request(app)
      .post("/api/watchlist")
      .set(kariSession.auth)
      .send({ orgNumber: ALTA_TOURS });

    const lukasList = await request(app)
      .get("/api/watchlist")
      .set(lukasSession.auth);
    const kariList = await request(app)
      .get("/api/watchlist")
      .set(kariSession.auth);

    expect(lukasList.body.map((item: { name: string }) => item.name)).toEqual([
      "ALTA TOURS AS",
      "ARCTIC FISH AS",
    ]);
    expect(kariList.body).toHaveLength(1);
  });

  it("returns an empty list for a new user", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).get("/api/watchlist").set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/watchlist/:orgNumber", () => {
  it("returns a followed company with the user's note", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS, note: "Main supplier" });

    const res = await request(app)
      .get(`/api/watchlist/${ALTA_TOURS}`)
      .set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      orgNumber: ALTA_TOURS,
      name: "ALTA TOURS AS",
      note: "Main supplier",
      company: { orgNumber: ALTA_TOURS, name: "ALTA TOURS AS" },
    });
    expect(res.body.followedSince).toEqual(expect.any(String));
  });

  it("returns 404 for a company the user does not follow", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .get(`/api/watchlist/${ALTA_TOURS}`)
      .set(auth);

    expect(res.status).toBe(404);
  });

  it("does not show another user's company or note", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const lukasSession = await registerAndLogin(lukas);
    const kariSession = await registerAndLogin(kari);
    await request(app)
      .post("/api/watchlist")
      .set(lukasSession.auth)
      .send({ orgNumber: ALTA_TOURS, note: "Private" });

    const res = await request(app)
      .get(`/api/watchlist/${ALTA_TOURS}`)
      .set(kariSession.auth);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("Private");
  });

  it("returns 400 for an invalid organization number", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).get("/api/watchlist/12345").set(auth);

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/watchlist/:orgNumber", () => {
  it("changes the note", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS, note: "Old" });

    const res = await request(app)
      .patch(`/api/watchlist/${ALTA_TOURS}`)
      .set(auth)
      .send({ note: "New" });

    expect(res.status).toBe(200);
    expect(res.body.note).toBe("New");
  });

  it.each([
    ["null", null],
    ["blank text", "   "],
  ])("removes the note when it is %s", async (_case, note) => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS, note: "Old" });

    const res = await request(app)
      .patch(`/api/watchlist/${ALTA_TOURS}`)
      .set(auth)
      .send({ note });

    expect(res.body.note).toBeNull();
  });

  it("returns 404 for a company another user follows", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const lukasSession = await registerAndLogin(lukas);
    const kariSession = await registerAndLogin(kari);
    await request(app)
      .post("/api/watchlist")
      .set(lukasSession.auth)
      .send({ orgNumber: ALTA_TOURS });

    const res = await request(app)
      .patch(`/api/watchlist/${ALTA_TOURS}`)
      .set(kariSession.auth)
      .send({ note: "Not mine" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/watchlist/:orgNumber", () => {
  it("unfollows the company but keeps the stored company", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS });

    const res = await request(app)
      .delete(`/api/watchlist/${ALTA_TOURS}`)
      .set(auth);

    expect(res.status).toBe(204);
    expect((await request(app).get("/api/watchlist").set(auth)).body).toEqual(
      [],
    );
    expect(await CompanyRecord.count()).toBe(1);
  });

  it("returns 404 when the company is not on the watchlist", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .delete(`/api/watchlist/${ALTA_TOURS}`)
      .set(auth);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/watchlist/:orgNumber/changes", () => {
  async function followWithHistory() {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const session = await registerAndLogin(lukas);
    await request(app)
      .post("/api/watchlist")
      .set(session.auth)
      .send({ orgNumber: ALTA_TOURS });

    const record = await CompanyRecord.findOne({
      where: { orgNumber: ALTA_TOURS },
      rejectOnEmpty: true,
    });
    const base = { companyId: record.id, sourceUpdateId: "1001" };
    await CompanyChange.bulkCreate([
      {
        ...base,
        field: "website",
        oldValue: null,
        newValue: "www.altatours.no",
        severity: "info",
        detectedAt: new Date("2026-01-01"),
      },
      {
        ...base,
        field: "address",
        oldValue: { city: "ALTA" },
        newValue: { city: "TROMSØ" },
        severity: "warning",
        detectedAt: new Date("2026-02-01"),
      },
      {
        ...base,
        field: "isBankrupt",
        oldValue: false,
        newValue: true,
        severity: "critical",
        detectedAt: new Date("2026-03-01"),
      },
    ]);
    return session;
  }

  it("lists the company's changes, newest first", async () => {
    const { auth } = await followWithHistory();

    const res = await request(app)
      .get(`/api/watchlist/${ALTA_TOURS}/changes`)
      .set(auth);

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(3);
    expect(res.body.items.map((c: { field: string }) => c.field)).toEqual([
      "isBankrupt",
      "address",
      "website",
    ]);
    expect(res.body.items[1]).toMatchObject({
      oldValue: { city: "ALTA" },
      newValue: { city: "TROMSØ" },
      severity: "warning",
    });
  });

  it("splits the history into pages", async () => {
    const { auth } = await followWithHistory();

    const page2 = await request(app)
      .get(`/api/watchlist/${ALTA_TOURS}/changes?page=2&pageSize=2`)
      .set(auth);

    expect(page2.body).toMatchObject({
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
    expect(page2.body.items.map((c: { field: string }) => c.field)).toEqual([
      "website",
    ]);
  });

  it("returns 404 for a company the user does not follow", async () => {
    await followWithHistory();
    const { auth } = await registerAndLogin(kari);

    const res = await request(app)
      .get(`/api/watchlist/${ALTA_TOURS}/changes`)
      .set(auth);

    expect(res.status).toBe(404);
  });

  it.each([
    ["page is 0", "page=0"],
    ["pageSize is above 100", "pageSize=101"],
    ["page is not a number", "page=abc"],
  ])("returns 400 when %s", async (_case, query) => {
    const { auth } = await followWithHistory();

    const res = await request(app)
      .get(`/api/watchlist/${ALTA_TOURS}/changes?${query}`)
      .set(auth);

    expect(res.status).toBe(400);
  });
});

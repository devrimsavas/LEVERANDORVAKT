import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import {
  MAX_BREAKDOWN_REGISTRATIONS,
  parseTrendParams,
} from "../src/services/trendsService.js";
import { useFakeBrreg } from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

// Every test runs on the same day, so "the current month" never moves
const NOW = new Date("2026-11-11T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const HOTELS = { kode: "55.100", beskrivelse: "Drift av hoteller" };
const RESTAURANTS = { kode: "56.101", beskrivelse: "Drift av restauranter" };

function searches() {
  return brreg.requests.filter((url) =>
    url.pathname.endsWith("/enhetsregisteret/api/enheter"),
  );
}

describe("parseTrendParams", () => {
  it("uses the last 12 months up to the current one by default", () => {
    expect(parseTrendParams({}, NOW)).toEqual({
      filters: { municipality: null, industry: null, form: null },
      from: "2025-12",
      to: "2026-11",
    });
  });

  it("accepts every filter and writes the organization form in capitals", () => {
    expect(
      parseTrendParams(
        {
          municipality: "5601",
          industry: "55",
          form: "as",
          from: "2026-01",
          to: "2026-03",
        },
        NOW,
      ),
    ).toEqual({
      filters: { municipality: "5601", industry: "55", form: "AS" },
      from: "2026-01",
      to: "2026-03",
    });
  });

  it.each([
    [{ from: "2026-13" }, "from and to must be months"],
    [{ from: "2026-05", to: "2026-04" }, "from must not be after to"],
    [{ to: "2026-12" }, "to must not be in the future"],
    [{ from: "2023-01", to: "2026-01" }, "At most 36 months"],
    [{ municipality: "Alta" }, "municipality must be"],
    [{ industry: "hotels" }, "industry must be"],
    [{ form: "A1" }, "form must be"],
  ])("rejects %j", (query, message) => {
    expect(() => parseTrendParams(query, NOW)).toThrow(message);
  });
});

describe("GET /api/trends/registrations", () => {
  it("counts new companies per month and compares them with a year earlier", async () => {
    brreg.addRegistrations(3, { date: "2026-03-05" });
    brreg.addRegistrations(1, { date: "2026-03-31" });
    brreg.addRegistrations(2, { date: "2025-03-20" });
    brreg.addRegistrations(1, { date: "2026-04-01" });

    const res = await request(app).get(
      "/api/trends/registrations?from=2026-03&to=2026-04",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      filters: { municipality: null, industry: null, form: null },
      from: "2026-03",
      to: "2026-04",
      months: [
        { month: "2026-03", count: 4, previousYear: 2, partial: false },
        { month: "2026-04", count: 1, previousYear: 0, partial: false },
      ],
      total: 5,
      previousYearTotal: 2,
      changePercent: 150,
    });
  });

  it("filters by municipality, industry (also by the start of a code) and form", async () => {
    brreg.addRegistrations(2, {
      date: "2026-03-10",
      municipality: "5601",
      industry: HOTELS,
    });
    brreg.addRegistrations(1, {
      date: "2026-03-10",
      municipality: "5601",
      industry: RESTAURANTS,
    });
    brreg.addRegistrations(1, {
      date: "2026-03-10",
      municipality: "5501",
      industry: HOTELS,
    });
    brreg.addRegistrations(1, {
      date: "2026-03-10",
      municipality: "5601",
      industry: HOTELS,
      form: "ENK",
    });

    const res = await request(app).get(
      "/api/trends/registrations?from=2026-03&to=2026-03&municipality=5601&industry=55&form=AS",
    );

    expect(res.body.total).toBe(2);
  });

  it("marks the current month as not over, and has no change without a previous year", async () => {
    brreg.addRegistrations(2, { date: "2026-11-03" });

    const res = await request(app).get(
      "/api/trends/registrations?from=2026-11&to=2026-11",
    );

    expect(res.body.months).toEqual([
      { month: "2026-11", count: 2, previousYear: 0, partial: true },
    ]);
    expect(res.body.changePercent).toBeNull();
  });

  it("answers the same question again from the cache, without calling Brreg", async () => {
    brreg.addRegistrations(1, { date: "2026-03-05" });
    await request(app).get("/api/trends/registrations?from=2026-01&to=2026-03");
    const first = searches().length;

    const res = await request(app).get(
      "/api/trends/registrations?from=2026-01&to=2026-03",
    );

    expect(first).toBe(6);
    expect(searches()).toHaveLength(first);
    expect(res.body.total).toBe(1);
  });

  it("fetches the current month again after 6 hours, but not the past months", async () => {
    await request(app).get("/api/trends/registrations?from=2026-10&to=2026-11");
    brreg.requests.length = 0;
    brreg.addRegistrations(1, { date: "2026-11-11" });

    vi.setSystemTime(new Date(NOW.getTime() + 7 * 60 * 60 * 1000));
    const res = await request(app).get(
      "/api/trends/registrations?from=2026-10&to=2026-11",
    );

    expect(searches()).toHaveLength(1);
    expect(res.body.months[1]).toMatchObject({ month: "2026-11", count: 1 });
  });

  it("returns 400 for invalid parameters", async () => {
    const res = await request(app).get(
      "/api/trends/registrations?municipality=Alta",
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("municipality");
  });

  it("returns 502 when Brreg cannot be reached", async () => {
    brreg.extraHandlers.push((url) =>
      url.pathname.endsWith("/enhetsregisteret/api/enheter")
        ? new Response(null, { status: 503, statusText: "Service Unavailable" })
        : null,
    );

    const res = await request(app).get("/api/trends/registrations");

    expect(res.status).toBe(502);
  });
});

describe("GET /api/trends/industries", () => {
  it("lists the industries new companies were registered in, most common first", async () => {
    brreg.addRegistrations(3, { date: "2026-03-10", industry: HOTELS });
    brreg.addRegistrations(2, { date: "2026-04-10", industry: RESTAURANTS });
    brreg.addRegistrations(1, { date: "2026-04-11", industry: null });

    const res = await request(app).get(
      "/api/trends/industries?from=2026-03&to=2026-04",
    );

    expect(res.body).toMatchObject({
      total: 6,
      industries: [
        { code: "55.100", description: "Drift av hoteller", count: 3 },
        { code: "56.101", description: "Drift av restauranter", count: 2 },
        { code: null, description: "No industry code registered", count: 1 },
      ],
      otherCount: 0,
      limitations: [],
    });
  });

  it("shows the ten most common industries and counts the rest together", async () => {
    for (let i = 0; i < 12; i++) {
      brreg.addRegistrations(12 - i, {
        date: "2026-03-10",
        industry: { kode: `${10 + i}.100`, beskrivelse: `Industry ${i}` },
      });
    }

    const res = await request(app).get(
      "/api/trends/industries?from=2026-03&to=2026-03",
    );

    expect(res.body.industries).toHaveLength(10);
    expect(res.body.industries[0]).toMatchObject({ code: "10.100", count: 12 });
    // The 11th and 12th industries have 2 and 1 registrations
    expect(res.body.otherCount).toBe(3);
  });

  it("reads every page of a month with many registrations", async () => {
    brreg.addRegistrations(150, { date: "2026-03-10", industry: HOTELS });

    const res = await request(app).get(
      "/api/trends/industries?from=2026-03&to=2026-03",
    );

    expect(res.body.industries).toEqual([
      { code: "55.100", description: "Drift av hoteller", count: 150 },
    ]);
  });

  it("does not download a period with too many registrations, and says why", async () => {
    brreg.addRegistrations(MAX_BREAKDOWN_REGISTRATIONS + 1, {
      date: "2026-03-10",
    });

    const res = await request(app).get(
      "/api/trends/industries?from=2026-03&to=2026-03",
    );

    expect(res.body).toMatchObject({
      total: MAX_BREAKDOWN_REGISTRATIONS + 1,
      industries: [],
    });
    expect(res.body.limitations[0]).toContain("Choose a shorter period");
    // Only the count was asked for, no company was downloaded
    expect(
      searches().every((url) => url.searchParams.get("size") === "1"),
    ).toBe(true);
  });
});

describe("GET /api/trends/municipalities", () => {
  it("lists the municipalities from Kartverket in Norwegian order, and keeps the list", async () => {
    const first = await request(app).get("/api/trends/municipalities");
    await request(app).get("/api/trends/municipalities");

    expect(first.body).toEqual([
      { number: "5601", name: "Alta" },
      { number: "0301", name: "Oslo" },
      { number: "5501", name: "Tromsø" },
    ]);
    expect(
      brreg.requests.filter((url) => url.hostname === "ws.geonorge.no"),
    ).toHaveLength(1);
  });

  it("returns 502 when Kartverket cannot be reached", async () => {
    brreg.municipalities = null;

    const res = await request(app).get("/api/trends/municipalities");

    expect(res.status).toBe(502);
  });
});

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

  it("compares the current month with the same days a year earlier, not the whole month", async () => {
    brreg.addRegistrations(2, { date: "2026-11-03" });
    brreg.addRegistrations(3, { date: "2025-11-05" });
    // Today is the 11th: the 11th itself counts, the 12th does not
    brreg.addRegistrations(1, { date: "2025-11-11" });
    brreg.addRegistrations(4, { date: "2025-11-12" });

    const res = await request(app).get(
      "/api/trends/registrations?from=2026-10&to=2026-11",
    );

    expect(res.body.months[1]).toEqual({
      month: "2026-11",
      count: 2,
      previousYear: 4,
      partial: true,
    });
    expect(res.body.changePercent).toBe(-50);
  });

  it("compares the whole month a year earlier when it has fewer days than today's date", async () => {
    // 29 February 2028: February 2027 has only 28 days
    vi.setSystemTime(new Date("2028-02-29T12:00:00Z"));
    brreg.addRegistrations(1, { date: "2027-02-28" });

    const res = await request(app).get(
      "/api/trends/registrations?from=2028-02&to=2028-02",
    );

    expect(res.body.months[0]).toMatchObject({
      previousYear: 1,
      partial: true,
    });
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

  it("stops asking Brreg after a failure and leaves nothing running", async () => {
    let calls = 0;
    brreg.extraHandlers.push(async (url) => {
      if (!url.pathname.endsWith("/enhetsregisteret/api/enheter")) {
        return null;
      }
      calls++;
      // The first month fails at once, the others answer slowly
      if (calls === 1) {
        return new Response(null, { status: 503 });
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
      return null;
    });

    const res = await request(app).get("/api/trends/registrations");
    const callsAtAnswer = calls;
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(res.status).toBe(502);
    // Only the requests started together with the failing one were made
    expect(callsAtAnswer).toBeLessThanOrEqual(5);
    expect(calls).toBe(callsAtAnswer);
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
  it("groups new companies by main industry, with names from SSB", async () => {
    brreg.addRegistrations(2, { date: "2026-03-10", industry: HOTELS });
    brreg.addRegistrations(1, {
      date: "2026-03-10",
      industry: { kode: "55.201", beskrivelse: "Drift av vandrerhjem" },
    });
    brreg.addRegistrations(2, {
      date: "2026-04-10",
      industry: { kode: "62.100", beskrivelse: "Dataprogrammeringstjenester" },
    });
    brreg.addRegistrations(2, {
      date: "2026-04-10",
      industry: {
        kode: "62.200",
        beskrivelse: "Konsulentvirksomhet tilknyttet IT",
      },
    });

    const res = await request(app).get(
      "/api/trends/industries?from=2026-03&to=2026-04",
    );

    expect(res.body).toMatchObject({
      level: "division",
      total: 7,
      industries: [
        {
          code: "62",
          description:
            "Dataprogrammering, konsulentvirksomhet og andre tjenester tilknyttet informasjonsteknologi",
          count: 4,
        },
        { code: "55", description: "Overnattingsvirksomhet", count: 3 },
      ],
      otherCount: 0,
      unspecifiedCount: 0,
      limitations: [],
    });
  });

  it("lists full industry codes with level=detailed", async () => {
    brreg.addRegistrations(3, { date: "2026-03-10", industry: HOTELS });
    brreg.addRegistrations(2, { date: "2026-04-10", industry: RESTAURANTS });

    const res = await request(app).get(
      "/api/trends/industries?from=2026-03&to=2026-04&level=detailed",
    );

    expect(res.body).toMatchObject({
      level: "detailed",
      industries: [
        { code: "55.100", description: "Drift av hoteller", count: 3 },
        { code: "56.101", description: "Drift av restauranter", count: 2 },
      ],
    });
  });

  it('counts companies without an industry apart, also Brreg\'s "00.000 Uoppgitt"', async () => {
    brreg.addRegistrations(2, { date: "2026-03-10", industry: HOTELS });
    brreg.addRegistrations(3, {
      date: "2026-03-10",
      industry: { kode: "00.000", beskrivelse: "Uoppgitt" },
    });
    brreg.addRegistrations(1, { date: "2026-03-10", industry: null });

    const res = await request(app).get(
      "/api/trends/industries?from=2026-03&to=2026-03",
    );

    expect(res.body).toMatchObject({
      total: 6,
      industries: [{ code: "55", count: 2 }],
      otherCount: 0,
      unspecifiedCount: 4,
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
      "/api/trends/industries?from=2026-03&to=2026-03&level=detailed",
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
      { code: "55", description: "Overnattingsvirksomhet", count: 150 },
    ]);
  });

  it("loads the industry names from SSB once", async () => {
    brreg.addRegistrations(1, { date: "2026-03-10", industry: HOTELS });

    await request(app).get("/api/trends/industries?from=2026-03&to=2026-03");
    await request(app).get("/api/trends/industries?from=2026-02&to=2026-03");

    expect(
      brreg.requests.filter((url) => url.hostname === "data.ssb.no"),
    ).toHaveLength(1);
  });

  it("shows main industries by code when SSB cannot be reached", async () => {
    brreg.industryDivisions = null;
    brreg.addRegistrations(2, { date: "2026-03-10", industry: HOTELS });

    const res = await request(app).get(
      "/api/trends/industries?from=2026-03&to=2026-03",
    );

    expect(res.status).toBe(200);
    expect(res.body.industries).toEqual([
      { code: "55", description: "Industry 55", count: 2 },
    ]);
    expect(res.body.limitations).toEqual([
      {
        code: "INDUSTRY_NAMES_UNAVAILABLE",
        reason: expect.stringContaining("could not be loaded from SSB"),
        params: {},
      },
    ]);
  });

  it("gives a total that the industries add up to, even when the monthly count in the cache is older", async () => {
    brreg.addRegistrations(1, { date: "2026-11-02", industry: HOTELS });
    // Caches the current month's count as 1
    await request(app).get("/api/trends/registrations?from=2026-11&to=2026-11");
    brreg.addRegistrations(1, { date: "2026-11-10", industry: HOTELS });

    const res = await request(app).get(
      "/api/trends/industries?from=2026-11&to=2026-11",
    );

    expect(res.body.total).toBe(2);
    expect(res.body.industries).toEqual([
      { code: "55", description: "Overnattingsvirksomhet", count: 2 },
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
    expect(res.body.limitations).toEqual([
      {
        code: "TOO_MANY_REGISTRATIONS",
        reason: expect.stringContaining("Choose a shorter period"),
        params: {
          total: MAX_BREAKDOWN_REGISTRATIONS + 1,
          max: MAX_BREAKDOWN_REGISTRATIONS,
        },
      },
    ]);
    // Only the count was asked for, no company was downloaded
    expect(
      searches().every((url) => url.searchParams.get("size") === "1"),
    ).toBe(true);
  });

  it("returns 400 for an unknown level", async () => {
    const res = await request(app).get("/api/trends/industries?level=sector");

    expect(res.status).toBe(400);
  });
});

describe("GET /api/trends/industry-divisions", () => {
  it("lists the main industries from SSB by code, and keeps the list", async () => {
    const first = await request(app).get("/api/trends/industry-divisions");
    await request(app).get("/api/trends/industry-divisions");

    expect(first.status).toBe(200);
    expect(first.body.map((d: { code: string }) => d.code)).toEqual([
      "41",
      "55",
      "56",
      "62",
    ]);
    expect(first.body[1]).toEqual({
      code: "55",
      name: "Overnattingsvirksomhet",
    });
    expect(
      brreg.requests.filter((url) => url.hostname === "data.ssb.no"),
    ).toHaveLength(1);
  });

  it("returns 502 when SSB cannot be reached", async () => {
    brreg.industryDivisions = null;

    const res = await request(app).get("/api/trends/industry-divisions");

    expect(res.status).toBe(502);
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

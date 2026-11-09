import { describe, expect, it } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import app from "../src/app.js";
import { toCompanyRoles } from "../src/mappers/companyRolesMapper.js";
import type { BrregRollerResponse } from "../src/types/brreg.js";
import { brregEnhet, brregRoller, useFakeBrreg } from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";

// A fictional company with the same structure as a real Brreg roles response
const rollerFixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/brregRoller.json", import.meta.url),
    "utf-8",
  ),
) as BrregRollerResponse;

describe("toCompanyRoles", () => {
  it("maps a real-shaped Brreg response to the app's roles", () => {
    expect(toCompanyRoles(rollerFixture)).toEqual({
      ceo: "Ingrid Solberg",
      boardChair: "Per Olav Hansen",
      deputyChair: null,
      // Sorted by name; "Tor Berg" is deregistered and left out
      boardMembers: ["Erik Aas Dahl", "Siri Østby"],
      deputyMembers: ["Nora Lie"],
      auditor: "NORDLYS REVISJON AS",
      accountant: null,
    });
  });

  it("does not include birth dates", () => {
    expect(JSON.stringify(toCompanyRoles(rollerFixture))).not.toContain("1968");
  });

  it("returns empty roles for a company without any", () => {
    expect(toCompanyRoles({})).toEqual({
      ceo: null,
      boardChair: null,
      deputyChair: null,
      boardMembers: [],
      deputyMembers: [],
      auditor: null,
      accountant: null,
    });
  });
});

describe("GET /api/companies/:orgNumber", () => {
  it("returns the company in the app's own shape", async () => {
    brreg.setActive(
      brregEnhet(ALTA_TOURS, "ALTA TOURS AS", { antallAnsatte: 12 }),
    );

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      orgNumber: ALTA_TOURS,
      name: "ALTA TOURS AS",
      organizationForm: "AS",
      employees: 12,
      isBankrupt: false,
      address: { city: "ALTA", municipalityNumber: "5601" },
      lastAnnualAccountsYear: 2025,
    });
  });

  it.each([
    ["does not exist", () => {}],
    ["has been struck off", () => brreg.setDeleted(ALTA_TOURS, "2026-11-08")],
  ])("returns 404 when the company %s", async (_case, arrange) => {
    arrange();

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}`);

    expect(res.status).toBe(404);
  });

  it("returns 400 for an organization number that is not 9 digits", async () => {
    const res = await request(app).get("/api/companies/12345");

    expect(res.status).toBe(400);
  });

  it("returns 502 when Brreg is not available", async () => {
    brreg.setError(ALTA_TOURS, 503);

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}`);

    expect(res.status).toBe(502);
  });
});

describe("GET /api/companies/search", () => {
  it("finds companies by name", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    brreg.setActive(brregEnhet("923456789", "ARCTIC FISH AS"));

    const res = await request(app).get("/api/companies/search?name=alta");

    expect(res.status).toBe(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual([
      "ALTA TOURS AS",
    ]);
  });

  it("returns an empty list when nothing matches", async () => {
    const res = await request(app).get("/api/companies/search?name=nothing");

    expect(res.body).toEqual([]);
  });

  it("sends Norwegian characters correctly to Brreg", async () => {
    await request(app).get("/api/companies/search?name=Tromsø%20Båt");

    const searched = brreg.requests.at(-1)!;
    expect(searched.searchParams.get("navn")).toBe("Tromsø Båt");
  });

  it.each([
    ["the name is missing", ""],
    ["the name is shorter than 2 characters", "?name=a"],
  ])("returns 400 when %s", async (_case, query) => {
    const res = await request(app).get(`/api/companies/search${query}`);

    expect(res.status).toBe(400);
  });
});

describe("GET /api/companies/:orgNumber/roles", () => {
  it("returns the current roles from Brreg", async () => {
    brreg.setRoles(
      ALTA_TOURS,
      brregRoller({
        ceo: "Ingrid Solberg",
        boardChair: "Per Olav Hansen",
        boardMembers: ["Siri Østby"],
        auditor: "NORDLYS REVISJON AS",
      }),
    );

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/roles`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ceo: "Ingrid Solberg",
      boardChair: "Per Olav Hansen",
      boardMembers: ["Siri Østby"],
      auditor: "NORDLYS REVISJON AS",
    });
  });

  it.each([
    ["404 when the company does not exist", undefined, 404],
    ["404 when the company has been removed (410)", 410, 404],
    ["502 when Brreg is not available", 503, 502],
  ])("returns %s", async (_case, brregStatus, expected) => {
    if (brregStatus) {
      brreg.setRolesError(ALTA_TOURS, brregStatus);
    }

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/roles`);

    expect(res.status).toBe(expected);
  });

  it("returns 400 for an organization number that is not 9 digits", async () => {
    const res = await request(app).get("/api/companies/abc/roles");

    expect(res.status).toBe(400);
  });
});

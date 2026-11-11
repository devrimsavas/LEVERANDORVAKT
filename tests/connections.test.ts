import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { toRoleHolders } from "../src/mappers/roleHoldersMapper.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, brregRoller, useFakeBrreg } from "./helpers/fakeBrreg.js";
import type { FakeRoles } from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";
const ARCTIC_FISH = "923456789";
const NORD_BYGG = "945678901";
const POLAR_TRANSPORT = "956789012";

type Auth = Record<string, string>;

const INGRID = "Ingrid Solberg";
const INGRID_BORN = "1968-05-04";

// Registers a company in the fake register with its roles
function company(orgNumber: string, name: string, roles: FakeRoles) {
  brreg.setActive(brregEnhet(orgNumber, name));
  brreg.setRoles(orgNumber, brregRoller(roles));
}

async function follow(auth: Auth, ...orgNumbers: string[]) {
  for (const orgNumber of orgNumbers) {
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber })
      .expect(201);
  }
}

function connections(auth: Auth, withOrgNumber?: string) {
  return request(app)
    .get("/api/watchlist/connections")
    .query(withOrgNumber ? { with: withOrgNumber } : {})
    .set(auth);
}

describe("toRoleHolders", () => {
  it("identifies people by name and birth date, organizations by organization number", () => {
    const holders = toRoleHolders(
      brregRoller({
        ceo: INGRID,
        boardMembers: ["Erik Dahl"],
        auditor: "NORDLYS REVISJON AS",
        auditorOrgNumber: "934567890",
        birthDates: { [INGRID]: INGRID_BORN, "Erik Dahl": null },
      }),
    );

    expect(holders).toEqual([
      {
        type: "person",
        name: INGRID,
        orgNumber: null,
        role: "ceo",
        matchKey: `person:ingrid solberg|${INGRID_BORN}`,
      },
      {
        type: "person",
        name: "Erik Dahl",
        orgNumber: null,
        role: "boardMember",
        // No birth date: cannot be matched safely
        matchKey: null,
      },
      {
        type: "organization",
        name: "NORDLYS REVISJON AS",
        orgNumber: "934567890",
        role: "auditor",
        matchKey: "organization:934567890",
      },
    ]);
  });

  it("leaves out roles that are no longer held", () => {
    const holders = toRoleHolders(
      brregRoller({
        boardMembers: ["Erik Dahl"],
        deregisteredMembers: ["Siri Østby"],
      }),
    );

    expect(holders.map((h) => h.name)).toEqual(["Erik Dahl"]);
  });
});

describe("GET /api/watchlist/connections", () => {
  it("finds a person who holds roles in two of the user's companies", async () => {
    company(ALTA_TOURS, "ALTA TOURS AS", {
      ceo: INGRID,
      birthDates: { [INGRID]: INGRID_BORN },
    });
    company(ARCTIC_FISH, "ARCTIC FISH AS", {
      boardMembers: [INGRID, "Erik Dahl"],
      birthDates: { [INGRID]: INGRID_BORN },
    });
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, ARCTIC_FISH);

    const res = await connections(auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      companiesChecked: 2,
      connections: [
        {
          type: "person",
          name: INGRID,
          orgNumber: null,
          roles: [
            { orgNumber: ALTA_TOURS, company: "ALTA TOURS AS", role: "ceo" },
            {
              orgNumber: ARCTIC_FISH,
              company: "ARCTIC FISH AS",
              role: "boardMember",
            },
          ],
        },
      ],
      limitations: [],
    });
  });

  it("does not connect two different people with the same name", async () => {
    company(ALTA_TOURS, "ALTA TOURS AS", {
      ceo: INGRID,
      birthDates: { [INGRID]: INGRID_BORN },
    });
    company(ARCTIC_FISH, "ARCTIC FISH AS", {
      ceo: INGRID,
      birthDates: { [INGRID]: "1991-11-20" },
    });
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, ARCTIC_FISH);

    const res = await connections(auth);

    expect(res.body.connections).toEqual([]);
  });

  it("does not match people without a birth date, and says so", async () => {
    company(ALTA_TOURS, "ALTA TOURS AS", {
      ceo: INGRID,
      birthDates: { [INGRID]: null },
    });
    company(ARCTIC_FISH, "ARCTIC FISH AS", {
      ceo: INGRID,
      birthDates: { [INGRID]: null },
    });
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, ARCTIC_FISH);

    const res = await connections(auth);

    expect(res.body.connections).toEqual([]);
    expect(res.body.limitations).toEqual([
      expect.objectContaining({ code: "PERSONS_WITHOUT_BIRTH_DATE" }),
    ]);
    expect(res.body.limitations[0].reason).toMatch(/^2 role holder/);
  });

  it("finds an audit firm shared by two companies", async () => {
    company(ALTA_TOURS, "ALTA TOURS AS", {
      auditor: "NORDLYS REVISJON AS",
      auditorOrgNumber: "934567890",
    });
    company(ARCTIC_FISH, "ARCTIC FISH AS", {
      auditor: "NORDLYS REVISJON AS",
      auditorOrgNumber: "934567890",
    });
    company(NORD_BYGG, "NORD BYGG AS", {
      auditor: "OTHER REVISJON AS",
      auditorOrgNumber: "934567899",
    });
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, ARCTIC_FISH, NORD_BYGG);

    const res = await connections(auth);

    expect(res.body.connections).toEqual([
      expect.objectContaining({
        type: "organization",
        name: "NORDLYS REVISJON AS",
        orgNumber: "934567890",
        roles: [
          expect.objectContaining({ orgNumber: ALTA_TOURS, role: "auditor" }),
          expect.objectContaining({ orgNumber: ARCTIC_FISH, role: "auditor" }),
        ],
      }),
    ]);
  });

  it("does not count several roles in the same company as a connection", async () => {
    company(ALTA_TOURS, "ALTA TOURS AS", {
      ceo: INGRID,
      boardChair: INGRID,
      birthDates: { [INGRID]: INGRID_BORN },
    });
    company(ARCTIC_FISH, "ARCTIC FISH AS", { ceo: "Erik Dahl" });
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, ARCTIC_FISH);

    const res = await connections(auth);

    expect(res.body.connections).toEqual([]);
  });

  it("lists the most connected first", async () => {
    const roles = { birthDates: { [INGRID]: INGRID_BORN } };
    company(ALTA_TOURS, "ALTA TOURS AS", {
      ...roles,
      ceo: INGRID,
      boardMembers: ["Erik Dahl"],
    });
    company(ARCTIC_FISH, "ARCTIC FISH AS", {
      ...roles,
      ceo: INGRID,
      boardMembers: ["Erik Dahl"],
    });
    company(NORD_BYGG, "NORD BYGG AS", { ...roles, ceo: INGRID });
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, ARCTIC_FISH, NORD_BYGG);

    const res = await connections(auth);

    expect(res.body.connections.map((c: { name: string }) => c.name)).toEqual([
      INGRID,
      "Erik Dahl",
    ]);
  });

  it("compares a company the user is considering with the watchlist", async () => {
    const roles = { birthDates: { [INGRID]: INGRID_BORN } };
    company(ALTA_TOURS, "ALTA TOURS AS", {
      ...roles,
      ceo: INGRID,
      boardMembers: ["Erik Dahl"],
    });
    company(ARCTIC_FISH, "ARCTIC FISH AS", {
      ...roles,
      boardMembers: ["Erik Dahl"],
    });
    company(POLAR_TRANSPORT, "POLAR TRANSPORT AS", {
      ...roles,
      boardChair: INGRID,
    });
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, ARCTIC_FISH);

    const res = await connections(auth, POLAR_TRANSPORT);

    // Erik Dahl connects two followed companies, but not the candidate
    expect(res.body.companiesChecked).toBe(3);
    expect(res.body.connections).toEqual([
      expect.objectContaining({
        name: INGRID,
        roles: [
          {
            orgNumber: POLAR_TRANSPORT,
            company: "POLAR TRANSPORT AS",
            role: "boardChair",
          },
          { orgNumber: ALTA_TOURS, company: "ALTA TOURS AS", role: "ceo" },
        ],
      }),
    ]);
  });

  it("only compares the user's own companies", async () => {
    const roles = { ceo: INGRID, birthDates: { [INGRID]: INGRID_BORN } };
    company(ALTA_TOURS, "ALTA TOURS AS", roles);
    company(ARCTIC_FISH, "ARCTIC FISH AS", roles);
    const { auth: kariAuth } = await registerAndLogin(kari);
    await follow(kariAuth, ARCTIC_FISH);
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS);

    const res = await connections(auth);

    expect(res.body).toEqual({
      companiesChecked: 1,
      connections: [],
      limitations: [],
    });
  });

  it("still compares the other companies when the roles of one cannot be fetched", async () => {
    const roles = { ceo: INGRID, birthDates: { [INGRID]: INGRID_BORN } };
    company(ALTA_TOURS, "ALTA TOURS AS", roles);
    company(ARCTIC_FISH, "ARCTIC FISH AS", roles);
    company(NORD_BYGG, "NORD BYGG AS", roles);
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, ARCTIC_FISH, NORD_BYGG);
    brreg.setRolesError(NORD_BYGG, 503);

    const res = await connections(auth);

    expect(res.status).toBe(200);
    expect(
      res.body.connections[0].roles.map(
        (r: { orgNumber: string }) => r.orgNumber,
      ),
    ).toEqual([ALTA_TOURS, ARCTIC_FISH]);
    expect(res.body.limitations).toEqual([
      {
        code: "ROLES_UNAVAILABLE",
        reason: `The roles of NORD BYGG AS (${NORD_BYGG}) could not be fetched.`,
      },
    ]);
  });

  it("never returns a birth date", async () => {
    company(ALTA_TOURS, "ALTA TOURS AS", {
      ceo: INGRID,
      birthDates: { [INGRID]: INGRID_BORN },
    });
    company(ARCTIC_FISH, "ARCTIC FISH AS", {
      ceo: INGRID,
      birthDates: { [INGRID]: INGRID_BORN },
    });
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, ARCTIC_FISH);

    const res = await connections(auth);

    expect(res.body.connections).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(INGRID_BORN);
  });

  it("returns an empty result for an empty watchlist", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await connections(auth);

    expect(res.body).toEqual({
      companiesChecked: 0,
      connections: [],
      limitations: [],
    });
  });

  it("returns 404 for a candidate company that does not exist", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await connections(auth, POLAR_TRANSPORT);

    expect(res.status).toBe(404);
  });

  it("returns 400 for a candidate that is not an organization number", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await connections(auth, "12345");

    expect(res.status).toBe(400);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/watchlist/connections");

    expect(res.status).toBe(401);
  });
});

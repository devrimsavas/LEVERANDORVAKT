import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { runChangeDetection } from "../src/services/changeDetectionService.js";
import { detectRoleChanges } from "../src/services/roleDiff.js";
import { BrregSyncState } from "../src/models/BrregSyncState.js";
import { CompanyRecord } from "../src/models/CompanyRecord.js";
import { CompanyChange } from "../src/models/CompanyChange.js";
import type { CompanyRoles } from "../src/types/companyRoles.js";
import { lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, brregRoller, useFakeBrreg } from "./helpers/fakeBrreg.js";
import type { FakeRoles } from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";
const ARCTIC_FISH = "923456789";

const altaRoles: FakeRoles = {
  ceo: "Ingrid Solberg",
  boardChair: "Per Olav Hansen",
  boardMembers: ["Siri Østby", "Erik Dahl"],
  auditor: "NORDLYS REVISJON AS",
};

function roleLookups(orgNumber: string) {
  return brreg.requests.filter((url) =>
    url.pathname.endsWith(`/enheter/${orgNumber}/roller`),
  ).length;
}

async function state() {
  return BrregSyncState.findOne({ rejectOnEmpty: true });
}

async function storedRoles(orgNumber: string) {
  const record = await CompanyRecord.findOne({
    where: { orgNumber },
    rejectOnEmpty: true,
  });
  return record.roles;
}

async function changesOf(orgNumber: string) {
  const record = await CompanyRecord.findOne({
    where: { orgNumber },
    rejectOnEmpty: true,
  });
  return CompanyChange.findAll({
    where: { companyId: record.id },
    order: [["id", "ASC"]],
  });
}

// Lukas follows Alta Tours, and the first run has recorded the starting points
async function setUpLukasFollowingAltaTours() {
  brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
  brreg.setRoles(ALTA_TOURS, brregRoller(altaRoles));
  const session = await registerAndLogin(lukas);
  await request(app)
    .post("/api/watchlist")
    .set(session.auth)
    .send({ orgNumber: ALTA_TOURS })
    .expect(201);
  await runChangeDetection();
  brreg.requests.length = 0;
  return session;
}

describe("detectRoleChanges", () => {
  const roles: CompanyRoles = {
    ceo: "Ingrid Solberg",
    boardChair: "Per Olav Hansen",
    deputyChair: null,
    boardMembers: ["Erik Dahl", "Siri Østby"],
    deputyMembers: [],
    auditor: "NORDLYS REVISJON AS",
    accountant: null,
  };

  it("reports each changed role with its severity", () => {
    const changes = detectRoleChanges(roles, {
      ...roles,
      ceo: "Lars Moe",
      boardMembers: ["Erik Dahl"],
      auditor: null,
    });

    expect(changes).toEqual([
      {
        field: "roles.ceo",
        oldValue: "Ingrid Solberg",
        newValue: "Lars Moe",
        severity: "warning",
      },
      {
        field: "roles.boardMembers",
        oldValue: ["Erik Dahl", "Siri Østby"],
        newValue: ["Erik Dahl"],
        severity: "info",
      },
      {
        field: "roles.auditor",
        oldValue: "NORDLYS REVISJON AS",
        newValue: null,
        severity: "warning",
      },
    ]);
  });

  it("reports nothing when the roles are the same", () => {
    expect(detectRoleChanges(roles, { ...roles })).toEqual([]);
  });

  it("reports nothing when no roles were stored before", () => {
    expect(detectRoleChanges(null, roles)).toEqual([]);
  });
});

describe("following a company", () => {
  it("stores the company's roles and shows them on the watchlist", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    brreg.setRoles(ALTA_TOURS, brregRoller(altaRoles));
    const { auth } = await registerAndLogin(lukas);

    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS });
    const res = await request(app).get("/api/watchlist").set(auth);

    expect(res.body[0].roles).toMatchObject({
      ceo: "Ingrid Solberg",
      boardChair: "Per Olav Hansen",
      boardMembers: ["Erik Dahl", "Siri Østby"],
      auditor: "NORDLYS REVISJON AS",
    });
  });
});

describe("starting points", () => {
  it("records the newest event of both feeds on the first run", async () => {
    brreg.addUpdate("111111111");
    brreg.addRoleEvent("111111111");
    brreg.addRoleEvent("222222222");

    const summary = await runChangeDetection();

    expect(summary.initialized).toBe(true);
    const current = await state();
    expect(Number(current.lastUpdateId)).toBe(1001);
    expect(Number(current.lastRoleEventId)).toBe(5002);
  });

  it("starts the role feed from now for an installation created before roles were tracked", async () => {
    await setUpLukasFollowingAltaTours();
    const current = await state();
    current.lastRoleEventId = null;
    await current.save();

    // A role change that happened before role tracking started
    brreg.setRoles(ALTA_TOURS, brregRoller({ ...altaRoles, ceo: "Lars Moe" }));
    const oldEvent = brreg.addRoleEvent(ALTA_TOURS);

    const summary = await runChangeDetection();

    expect(summary.initialized).toBe(false);
    expect(summary.changesFound).toBe(0);
    expect(Number((await state()).lastRoleEventId)).toBe(oldEvent);
  });
});

describe("filling in missing roles", () => {
  it("stores the roles of a company followed before roles were tracked, without reporting changes", async () => {
    await setUpLukasFollowingAltaTours();
    await CompanyRecord.update(
      { roles: null },
      { where: { orgNumber: ALTA_TOURS } },
    );

    // No feed events at all for the company
    const summary = await runChangeDetection();

    expect(summary.changesFound).toBe(0);
    expect(await CompanyChange.count()).toBe(0);
    expect((await storedRoles(ALTA_TOURS))?.ceo).toBe("Ingrid Solberg");
  });

  it("does not fail the run when the roles cannot be fetched, and tries again next time", async () => {
    await setUpLukasFollowingAltaTours();
    await CompanyRecord.update(
      { roles: null },
      { where: { orgNumber: ALTA_TOURS } },
    );
    brreg.setRolesError(ALTA_TOURS, 503);

    const failed = await runChangeDetection();

    expect(failed.failedCompanies).toBe(0);
    expect(await storedRoles(ALTA_TOURS)).toBeNull();

    brreg.setRoles(ALTA_TOURS, brregRoller(altaRoles));
    await runChangeDetection();

    expect((await storedRoles(ALTA_TOURS))?.ceo).toBe("Ingrid Solberg");
  });
});

describe("detecting role changes", () => {
  it("records a new CEO and notifies the follower", async () => {
    const { auth } = await setUpLukasFollowingAltaTours();
    brreg.setRoles(ALTA_TOURS, brregRoller({ ...altaRoles, ceo: "Lars Moe" }));
    const eventId = brreg.addRoleEvent(ALTA_TOURS);

    const summary = await runChangeDetection();

    expect(summary).toMatchObject({
      companiesChecked: 1,
      changesFound: 1,
      failedCompanies: 0,
    });
    const [change] = await changesOf(ALTA_TOURS);
    expect(change).toMatchObject({
      field: "roles.ceo",
      oldValue: "Ingrid Solberg",
      newValue: "Lars Moe",
      severity: "warning",
      sourceUpdateId: String(eventId),
    });
    const notifications = await request(app)
      .get("/api/notifications")
      .set(auth);
    expect(notifications.body.items[0].change.field).toBe("roles.ceo");
    expect(Number((await state()).lastRoleEventId)).toBe(eventId);
  });

  it("records the auditor leaving", async () => {
    await setUpLukasFollowingAltaTours();
    const { auditor: _auditor, ...withoutAuditor } = altaRoles;
    brreg.setRoles(ALTA_TOURS, brregRoller(withoutAuditor));
    brreg.addRoleEvent(ALTA_TOURS);

    await runChangeDetection();

    const [change] = await changesOf(ALTA_TOURS);
    expect(change).toMatchObject({
      field: "roles.auditor",
      oldValue: "NORDLYS REVISJON AS",
      newValue: null,
      severity: "warning",
    });
  });

  it("treats a deregistered board member as having left the board", async () => {
    await setUpLukasFollowingAltaTours();
    brreg.setRoles(
      ALTA_TOURS,
      brregRoller({
        ...altaRoles,
        boardMembers: ["Erik Dahl"],
        deregisteredMembers: ["Siri Østby"],
      }),
    );
    brreg.addRoleEvent(ALTA_TOURS);

    await runChangeDetection();

    const [change] = await changesOf(ALTA_TOURS);
    expect(change).toMatchObject({
      field: "roles.boardMembers",
      newValue: ["Erik Dahl"],
      severity: "info",
    });
  });

  it("records nothing when only the order of board members changes", async () => {
    await setUpLukasFollowingAltaTours();
    brreg.setRoles(
      ALTA_TOURS,
      brregRoller({ ...altaRoles, boardMembers: ["Erik Dahl", "Siri Østby"] }),
    );
    brreg.addRoleEvent(ALTA_TOURS);

    const summary = await runChangeDetection();

    expect(summary).toMatchObject({ companiesChecked: 1, changesFound: 0 });
  });

  it("checks a company once when it appears in both feeds, and records both kinds of change", async () => {
    await setUpLukasFollowingAltaTours();
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS", { konkurs: true }));
    brreg.setRoles(ALTA_TOURS, brregRoller({ ...altaRoles, ceo: "Lars Moe" }));
    brreg.addUpdate(ALTA_TOURS);
    brreg.addRoleEvent(ALTA_TOURS);

    const summary = await runChangeDetection();

    expect(summary).toMatchObject({ companiesChecked: 1, changesFound: 2 });
    expect(roleLookups(ALTA_TOURS)).toBe(1);
    expect((await changesOf(ALTA_TOURS)).map((c) => c.field)).toEqual([
      "isBankrupt",
      "roles.ceo",
      "riskLevel",
    ]);
  });

  it("keeps the stored roles when Brreg has none for the company", async () => {
    await setUpLukasFollowingAltaTours();
    brreg.roles.delete(ALTA_TOURS);
    brreg.addRoleEvent(ALTA_TOURS);

    const summary = await runChangeDetection();

    expect(summary.changesFound).toBe(0);
    expect((await storedRoles(ALTA_TOURS))?.ceo).toBe("Ingrid Solberg");
  });
});

describe("when the roles cannot be fetched", () => {
  it("stops before the failing company in both feeds and catches up on the next run", async () => {
    const { auth } = await setUpLukasFollowingAltaTours();
    brreg.setActive(brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS"));
    brreg.setRoles(ARCTIC_FISH, brregRoller({ ceo: "Kari Berg" }));
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ARCTIC_FISH })
      .expect(201);
    const before = await state();

    // Alta Tours gets a new CEO; then Arctic Fish has a company update and a
    // role update, but its roles cannot be fetched
    brreg.setRoles(ALTA_TOURS, brregRoller({ ...altaRoles, ceo: "Lars Moe" }));
    brreg.addRoleEvent(ALTA_TOURS);
    const fishUpdate = brreg.addUpdate(ARCTIC_FISH);
    const fishRoleEvent = brreg.addRoleEvent(ARCTIC_FISH);
    brreg.setRolesError(ARCTIC_FISH, 503);

    const failed = await runChangeDetection();

    expect(failed).toMatchObject({
      companiesChecked: 1,
      changesFound: 1,
      failedCompanies: 1,
    });
    const afterFailure = await state();
    expect(Number(afterFailure.lastUpdateId)).toBe(fishUpdate - 1);
    expect(Number(afterFailure.lastRoleEventId)).toBe(fishRoleEvent - 1);
    expect(Number(afterFailure.lastRoleEventId)).toBeGreaterThan(
      Number(before.lastRoleEventId),
    );

    // Brreg is back: Arctic Fish's new CEO is found, Alta Tours is not recorded twice
    brreg.setRoles(ARCTIC_FISH, brregRoller({ ceo: "Ola Nilsen" }));
    const recovered = await runChangeDetection();

    expect(recovered).toMatchObject({ changesFound: 1, failedCompanies: 0 });
    expect(
      (await changesOf(ARCTIC_FISH)).map((c) => [c.field, c.newValue]),
    ).toEqual([["roles.ceo", "Ola Nilsen"]]);
    expect(await changesOf(ALTA_TOURS)).toHaveLength(1);
    const end = await state();
    expect(Number(end.lastUpdateId)).toBe(fishUpdate);
    expect(Number(end.lastRoleEventId)).toBe(fishRoleEvent);
  });
});

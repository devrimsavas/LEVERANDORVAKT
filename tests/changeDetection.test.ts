import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { runChangeDetection } from "../src/services/changeDetectionService.js";
import { BrregSyncState } from "../src/models/BrregSyncState.js";
import { CompanyRecord } from "../src/models/CompanyRecord.js";
import { CompanyChange } from "../src/models/CompanyChange.js";
import { Notification } from "../src/models/Notification.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, useFakeBrreg } from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";
const ARCTIC_FISH = "923456789";
const NOBODY_FOLLOWS = "934567890";

function lookups(orgNumber: string) {
  return brreg.requests.filter((url) => url.pathname.endsWith(`/enheter/${orgNumber}`)).length;
}

async function follow(auth: Record<string, string>, orgNumber: string) {
  await request(app).post("/api/watchlist").set(auth).send({ orgNumber }).expect(201);
}

async function lastUpdateId() {
  const state = await BrregSyncState.findOne({ rejectOnEmpty: true });
  return Number(state.lastUpdateId);
}

async function changesOf(orgNumber: string) {
  const record = await CompanyRecord.findOne({ where: { orgNumber }, rejectOnEmpty: true });
  return CompanyChange.findAll({ where: { companyId: record.id }, order: [["id", "ASC"]] });
}

// Lukas follows Alta Tours, and the first run has recorded the starting point
async function setUpLukasFollowingAltaTours() {
  brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
  const session = await registerAndLogin(lukas);
  await follow(session.auth, ALTA_TOURS);
  await runChangeDetection();
  brreg.requests.length = 0;
  return session;
}

describe("first run", () => {
  it("records the newest update id as the starting point and checks nothing", async () => {
    brreg.addUpdate("111111111");
    brreg.addUpdate("222222222");

    const summary = await runChangeDetection();

    expect(summary).toEqual({ initialized: true, companiesChecked: 0, changesFound: 0, failedCompanies: 0 });
    expect(await lastUpdateId()).toBe(1002);
  });
});

describe("detecting changes", () => {
  it("records each changed field with its severity and the update that revealed it", async () => {
    await setUpLukasFollowingAltaTours();
    brreg.setActive(
      brregEnhet(ALTA_TOURS, "ALTA TOURS AS", {
        konkurs: true,
        forretningsadresse: { postnummer: "9008", poststed: "TROMSØ", kommune: "TROMSØ", kommunenummer: "5501" },
      }),
    );
    const updateId = brreg.addUpdate(ALTA_TOURS);

    const summary = await runChangeDetection();

    expect(summary).toMatchObject({ companiesChecked: 1, changesFound: 2, failedCompanies: 0 });
    const changes = await changesOf(ALTA_TOURS);
    // The bankruptcy also raises the risk level, which is recorded after the changes
    expect(changes.map((c) => [c.field, c.severity])).toEqual([
      ["address", "warning"],
      ["isBankrupt", "critical"],
      ["riskLevel", "critical"],
    ]);
    expect(changes[1]).toMatchObject({ oldValue: false, newValue: true, sourceUpdateId: String(updateId) });
  });

  it("updates the stored state, so the same change is never recorded twice", async () => {
    await setUpLukasFollowingAltaTours();
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS", { konkurs: true }));
    brreg.addUpdate(ALTA_TOURS);
    await runChangeDetection();

    // Brreg reports another update, but nothing in the company has changed since
    brreg.addUpdate(ALTA_TOURS);
    const summary = await runChangeDetection();

    expect(summary).toMatchObject({ companiesChecked: 1, changesFound: 0 });
    const record = await CompanyRecord.findOne({ where: { orgNumber: ALTA_TOURS }, rejectOnEmpty: true });
    expect(record.snapshot.isBankrupt).toBe(true);
    expect(record.lastChangedAt).not.toBeNull();
    // The bankruptcy and the risk level it raised, each recorded once
    expect(await CompanyChange.count()).toBe(2);
  });

  it("records nothing when an update does not touch any tracked field", async () => {
    await setUpLukasFollowingAltaTours();
    brreg.addUpdate(ALTA_TOURS);

    const summary = await runChangeDetection();

    expect(summary).toMatchObject({ companiesChecked: 1, changesFound: 0 });
    const record = await CompanyRecord.findOne({ where: { orgNumber: ALTA_TOURS }, rejectOnEmpty: true });
    expect(record.lastChangedAt).toBeNull();
  });

  it("asks Brreg once per company, even with several updates for it", async () => {
    await setUpLukasFollowingAltaTours();
    brreg.addUpdate(ALTA_TOURS);
    brreg.addUpdate(ALTA_TOURS);
    brreg.addUpdate(ALTA_TOURS);

    await runChangeDetection();

    expect(lookups(ALTA_TOURS)).toBe(1);
  });

  it("ignores updates for companies that are not stored", async () => {
    await setUpLukasFollowingAltaTours();
    brreg.setActive(brregEnhet(NOBODY_FOLLOWS, "SOMEONE ELSE AS"));
    brreg.addUpdate(NOBODY_FOLLOWS);

    const summary = await runChangeDetection();

    expect(summary.companiesChecked).toBe(0);
    expect(lookups(NOBODY_FOLLOWS)).toBe(0);
  });

  it("does nothing when there are no new updates", async () => {
    await setUpLukasFollowingAltaTours();
    const before = await lastUpdateId();

    const summary = await runChangeDetection();

    expect(summary).toMatchObject({ companiesChecked: 0, changesFound: 0 });
    expect(await lastUpdateId()).toBe(before);
  });
});

describe("struck-off companies", () => {
  it("records the deletion once and stops checking the company", async () => {
    await setUpLukasFollowingAltaTours();
    brreg.setDeleted(ALTA_TOURS, "2026-11-08");
    brreg.addUpdate(ALTA_TOURS, "Sletting");

    const summary = await runChangeDetection();

    expect(summary).toMatchObject({ companiesChecked: 1, changesFound: 1 });
    const [change] = await changesOf(ALTA_TOURS);
    expect(change).toMatchObject({ field: "deletedFromRegistry", newValue: "2026-11-08", severity: "critical" });

    // The last known active state is kept
    const record = await CompanyRecord.findOne({ where: { orgNumber: ALTA_TOURS }, rejectOnEmpty: true });
    expect(record.deletedFromRegistryAt).not.toBeNull();
    expect(record.snapshot.name).toBe("ALTA TOURS AS");

    // Later updates for the company are no longer looked up
    brreg.requests.length = 0;
    brreg.addUpdate(ALTA_TOURS);
    await runChangeDetection();
    expect(lookups(ALTA_TOURS)).toBe(0);
  });

  it("treats 410 Gone as struck off", async () => {
    await setUpLukasFollowingAltaTours();
    brreg.setError(ALTA_TOURS, 410);
    brreg.addUpdate(ALTA_TOURS);

    await runChangeDetection();

    const [change] = await changesOf(ALTA_TOURS);
    expect(change).toMatchObject({ field: "deletedFromRegistry", newValue: null, severity: "critical" });
  });
});

describe("when Brreg fails", () => {
  it("stops before the failing company and catches up on the next run", async () => {
    const { auth } = await setUpLukasFollowingAltaTours();
    brreg.setActive(brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS"));
    await follow(auth, ARCTIC_FISH);
    const startingPoint = await lastUpdateId();

    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS", { konkurs: true }));
    brreg.addUpdate(ALTA_TOURS);
    brreg.setError(ARCTIC_FISH, 503);
    const fishUpdate = brreg.addUpdate(ARCTIC_FISH);

    const failed = await runChangeDetection();

    expect(failed).toMatchObject({ companiesChecked: 1, changesFound: 1, failedCompanies: 1 });
    // The position stays just before the failed company's update
    expect(await lastUpdateId()).toBe(fishUpdate - 1);
    expect(await lastUpdateId()).toBeGreaterThan(startingPoint);

    // Brreg is back: the missed change is found, and nothing is recorded twice
    brreg.setActive(brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS", { underAvvikling: true }));
    const recovered = await runChangeDetection();

    expect(recovered).toMatchObject({ changesFound: 1, failedCompanies: 0 });
    expect((await changesOf(ARCTIC_FISH)).map((c) => c.field)).toEqual(["isUnderLiquidation", "riskLevel"]);
    expect((await changesOf(ALTA_TOURS)).map((c) => c.field)).toEqual(["isBankrupt", "riskLevel"]);
    expect(await lastUpdateId()).toBe(fishUpdate);
  });
});

describe("notifications", () => {
  it("notifies every follower of the changed company, and nobody else", async () => {
    const lukasSession = await setUpLukasFollowingAltaTours();
    const kariSession = await registerAndLogin(kari);
    await follow(kariSession.auth, ALTA_TOURS);
    const olaSession = await registerAndLogin({ ...kari, firstName: "Ola", email: "ola@example.com" });
    brreg.setActive(brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS"));
    await follow(olaSession.auth, ARCTIC_FISH);

    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS", { konkurs: true }));
    brreg.addUpdate(ALTA_TOURS);
    await runChangeDetection();

    const count = async (auth: Record<string, string>) =>
      (await request(app).get("/api/notifications/unread-count").set(auth)).body.count;
    expect(await count(lukasSession.auth)).toBe(1);
    expect(await count(kariSession.auth)).toBe(1);
    expect(await count(olaSession.auth)).toBe(0);
  });

  it("saves nothing when notifications cannot be saved, and retries on the next run", async () => {
    await setUpLukasFollowingAltaTours();
    const before = await lastUpdateId();
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS", { konkurs: true }));
    brreg.addUpdate(ALTA_TOURS);

    const failingInsert = vi
      .spyOn(Notification, "bulkCreate")
      .mockRejectedValueOnce(new Error("Database unavailable"));
    const failed = await runChangeDetection();
    failingInsert.mockRestore();

    // The change and the new snapshot were rolled back together with the notifications
    expect(failed.failedCompanies).toBe(1);
    expect(await CompanyChange.count()).toBe(0);
    const record = await CompanyRecord.findOne({ where: { orgNumber: ALTA_TOURS }, rejectOnEmpty: true });
    expect(record.snapshot.isBankrupt).toBe(false);
    expect(await lastUpdateId()).toBe(before);

    await runChangeDetection();

    // The bankruptcy and the risk level; only the bankruptcy is notified,
    // so the follower does not get the same news twice
    expect(await CompanyChange.count()).toBe(2);
    expect(await Notification.count()).toBe(1);
  });
});
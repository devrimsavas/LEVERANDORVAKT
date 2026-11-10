import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { compareAccounts } from "../src/services/accountsDiff.js";
import { runAccountsCheck } from "../src/services/accountsService.js";
import { toAnnualAccounts } from "../src/mappers/annualAccountsMapper.js";
import { CompanyRecord } from "../src/models/CompanyRecord.js";
import { CompanyChange } from "../src/models/CompanyChange.js";
import { AnnualAccountsRecord } from "../src/models/AnnualAccountsRecord.js";
import { Notification } from "../src/models/Notification.js";
import { lukas, registerAndLogin } from "./helpers/users.js";
import {
  brregEnhet,
  brregRegnskap,
  useFakeBrreg,
} from "./helpers/fakeBrreg.js";
import type { FakeAccounts } from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";
const ARCTIC_FISH = "923456789";

const BANK_MESSAGE =
  "Regnskapet inneholder en oppstillingsplan som ikke er stottet (BANK)";

// The accounts as the app sees them after mapping
function accounts(fake: FakeAccounts) {
  return toAnnualAccounts(brregRegnskap(fake));
}

// Lukas follows a company whose accounts Brreg already has
async function follow(orgNumber: string, name: string, list: FakeAccounts[]) {
  brreg.setActive(brregEnhet(orgNumber, name));
  brreg.setAccounts(orgNumber, list.map(brregRegnskap));
  const session = await registerAndLogin(lukas);
  await request(app)
    .post("/api/watchlist")
    .set(session.auth)
    .send({ orgNumber })
    .expect(201);
  return session;
}

// Makes the last accounts check of a company old enough to be checked again
async function checkedYesterday(orgNumber: string) {
  await CompanyRecord.update(
    { accountsCheckedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    { where: { orgNumber } },
  );
}

async function record(orgNumber: string) {
  return CompanyRecord.findOne({ where: { orgNumber }, rejectOnEmpty: true });
}

async function changesOf(orgNumber: string) {
  const company = await record(orgNumber);
  return CompanyChange.findAll({
    where: { companyId: company.id },
    order: [["id", "ASC"]],
  });
}

describe("compareAccounts", () => {
  const stored = [
    accounts({ id: 1, year: 2024 }),
    accounts({ id: 2, year: 2024, type: "group" }),
  ];

  it("stores everything as the starting point when the accounts were never checked", () => {
    const current = [accounts({ id: 1, year: 2024, equity: -1 })];

    expect(compareAccounts(null, current)).toEqual({
      toSave: current,
      changes: [],
    });
  });

  it("reports nothing when nothing is new", () => {
    expect(compareAccounts(stored, stored)).toEqual({
      toSave: [],
      changes: [],
    });
  });

  it("reports one filing per period, for the company and the group together", () => {
    const new2025 = [
      accounts({ id: 3, year: 2025 }),
      accounts({ id: 4, year: 2025, type: "group" }),
    ];

    const result = compareAccounts(stored, [...new2025, ...stored]);

    expect(result.toSave).toEqual(new2025);
    expect(result.changes).toEqual([
      {
        field: "annualAccounts.filed",
        oldValue: null,
        newValue: {
          year: 2025,
          periodEnd: "2025-12-31",
          types: ["company", "group"],
        },
        severity: "info",
      },
    ]);
  });

  it("reports a corrected filing of a known period", () => {
    const corrected = accounts({ id: 9, year: 2024 });

    const result = compareAccounts(stored, [corrected, stored[1]!]);

    expect(result.toSave).toEqual([corrected]);
    expect(result.changes).toEqual([
      {
        field: "annualAccounts.corrected",
        oldValue: null,
        newValue: { year: 2024, periodEnd: "2024-12-31", types: ["company"] },
        severity: "info",
      },
    ]);
  });

  it("reports nothing when Brreg stops listing an old year", () => {
    expect(compareAccounts(stored, [stored[1]!]).changes).toEqual([]);
  });

  it("warns when equity turns negative", () => {
    const result = compareAccounts(stored, [
      accounts({ id: 3, year: 2025, equity: -200000 }),
    ]);

    expect(result.changes).toContainEqual({
      field: "annualAccounts.negativeEquity",
      oldValue: { year: 2024, equity: 5000000, currency: "NOK" },
      newValue: { year: 2025, equity: -200000, currency: "NOK" },
      severity: "warning",
    });
  });

  it("does not warn again when equity was already negative", () => {
    const negative = [accounts({ id: 1, year: 2024, equity: -100000 })];

    const result = compareAccounts(negative, [
      accounts({ id: 3, year: 2025, equity: -200000 }),
    ]);

    expect(result.changes.map((c) => c.field)).toEqual([
      "annualAccounts.filed",
    ]);
  });

  it("warns about negative equity in a company's first accounts", () => {
    const result = compareAccounts(
      [],
      [accounts({ id: 3, year: 2025, equity: -200000 })],
    );

    expect(result.changes).toContainEqual(
      expect.objectContaining({
        field: "annualAccounts.negativeEquity",
        oldValue: null,
      }),
    );
  });

  it("warns when the accounts are no longer audited", () => {
    const result = compareAccounts(stored, [
      accounts({ id: 3, year: 2025, audited: false }),
    ]);

    expect(result.changes).toContainEqual({
      field: "annualAccounts.auditDropped",
      oldValue: { year: 2024, audited: true },
      newValue: { year: 2025, audited: false },
      severity: "warning",
    });
  });

  it("does not warn about a company that has never been audited", () => {
    const unaudited = [accounts({ id: 1, year: 2024, audited: false })];

    const result = compareAccounts(unaudited, [
      accounts({ id: 3, year: 2025, audited: false }),
    ]);

    expect(result.changes.map((c) => c.field)).toEqual([
      "annualAccounts.filed",
    ]);
  });

  it("reports liquidation accounts as critical", () => {
    const result = compareAccounts(stored, [
      accounts({ id: 3, year: 2025, liquidation: true }),
    ]);

    expect(result.changes).toContainEqual({
      field: "annualAccounts.liquidation",
      oldValue: null,
      newValue: { year: 2025 },
      severity: "critical",
    });
  });

  it("looks for warning signs only in the company's own accounts, not the group's", () => {
    const result = compareAccounts(stored, [
      accounts({ id: 3, year: 2025 }),
      accounts({
        id: 4,
        year: 2025,
        type: "group",
        equity: -1,
        liquidation: true,
      }),
    ]);

    expect(result.changes.map((c) => c.field)).toEqual([
      "annualAccounts.filed",
    ]);
  });

  it("compares year by year when two years are filed at once", () => {
    const result = compareAccounts(stored, [
      accounts({ id: 4, year: 2026, equity: -300000 }),
      accounts({ id: 3, year: 2025, equity: -100000 }),
    ]);

    // 2025 turned negative; 2026 was already negative after 2025
    expect(
      result.changes.map((c) => [
        c.field,
        (c.newValue as { year: number }).year,
      ]),
    ).toEqual([
      ["annualAccounts.filed", 2025],
      ["annualAccounts.negativeEquity", 2025],
      ["annualAccounts.filed", 2026],
    ]);
  });
});

describe("following a company", () => {
  it("stores its accounts as the starting point and shows the latest on the watchlist", async () => {
    const { auth } = await follow(ALTA_TOURS, "ALTA TOURS AS", [
      { id: 2, year: 2025, type: "group" },
      { id: 1, year: 2025 },
      { id: 3, year: 2024 },
    ]);

    const res = await request(app).get("/api/watchlist").set(auth);

    expect(res.body[0].accounts.status).toBe("available");
    expect(res.body[0].accounts.latest).toMatchObject({
      brregId: 1,
      year: 2025,
      type: "company",
    });
    expect(await AnnualAccountsRecord.count()).toBe(3);
    expect(await CompanyChange.count()).toBe(0);
  });

  it("still works when the accounts register is unavailable, and the daily check fills them in", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    brreg.setAccountsError(ALTA_TOURS, 503, "Service Unavailable");
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS });

    expect(res.status).toBe(201);
    expect(res.body.accounts).toEqual({ status: null, latest: null });

    brreg.setAccounts(ALTA_TOURS, [brregRegnskap({ id: 1, year: 2025 })]);
    const summary = await runAccountsCheck();

    expect(summary).toEqual({
      companiesChecked: 1,
      changesFound: 0,
      failedCompanies: 0,
    });
    expect(await AnnualAccountsRecord.count()).toBe(1);
  });

  it("marks a company the accounts register does not cover as unsupported", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA BANK ASA"));
    brreg.setAccountsError(ALTA_TOURS, 500, BANK_MESSAGE);
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS });

    expect(res.body.accounts).toEqual({ status: "unsupported", latest: null });
  });
});

describe("the daily accounts check", () => {
  it("records new accounts and notifies the follower", async () => {
    const { auth } = await follow(ALTA_TOURS, "ALTA TOURS AS", [
      { id: 1, year: 2024 },
    ]);
    brreg.setAccounts(ALTA_TOURS, [
      brregRegnskap({ id: 2, year: 2025, equity: -50000 }),
      brregRegnskap({ id: 1, year: 2024 }),
    ]);
    await checkedYesterday(ALTA_TOURS);

    const summary = await runAccountsCheck();

    expect(summary).toEqual({
      companiesChecked: 1,
      changesFound: 2,
      failedCompanies: 0,
    });
    expect(
      (await changesOf(ALTA_TOURS)).map((c) => [
        c.field,
        c.severity,
        c.sourceUpdateId,
      ]),
    ).toEqual([
      ["annualAccounts.filed", "info", null],
      ["annualAccounts.negativeEquity", "warning", null],
    ]);
    const notifications = await request(app)
      .get("/api/notifications")
      .set(auth);
    expect(notifications.body.totalItems).toBe(2);
    expect((await record(ALTA_TOURS)).lastChangedAt).not.toBeNull();
  });

  it("records the first accounts of a company that had none", async () => {
    await follow(ALTA_TOURS, "ALTA TOURS AS", []);
    brreg.setAccounts(ALTA_TOURS, [brregRegnskap({ id: 1, year: 2025 })]);
    await checkedYesterday(ALTA_TOURS);

    await runAccountsCheck();

    expect((await changesOf(ALTA_TOURS)).map((c) => c.field)).toEqual([
      "annualAccounts.filed",
    ]);
  });

  it("does not check a company again within a day", async () => {
    await follow(ALTA_TOURS, "ALTA TOURS AS", [{ id: 1, year: 2024 }]);
    brreg.setAccounts(ALTA_TOURS, [brregRegnskap({ id: 2, year: 2025 })]);

    const summary = await runAccountsCheck();

    expect(summary.companiesChecked).toBe(0);
    expect(await CompanyChange.count()).toBe(0);
  });

  it("does not record the same accounts twice", async () => {
    await follow(ALTA_TOURS, "ALTA TOURS AS", [{ id: 1, year: 2024 }]);
    brreg.setAccounts(ALTA_TOURS, [
      brregRegnskap({ id: 2, year: 2025 }),
      brregRegnskap({ id: 1, year: 2024 }),
    ]);
    await checkedYesterday(ALTA_TOURS);
    await runAccountsCheck();
    await checkedYesterday(ALTA_TOURS);

    const second = await runAccountsCheck();

    expect(second).toEqual({
      companiesChecked: 1,
      changesFound: 0,
      failedCompanies: 0,
    });
    expect(await CompanyChange.count()).toBe(1);
  });

  it("replaces the stored accounts with a corrected filing", async () => {
    await follow(ALTA_TOURS, "ALTA TOURS AS", [
      { id: 1, year: 2024, equity: 100 },
    ]);
    brreg.setAccounts(ALTA_TOURS, [
      brregRegnskap({ id: 7, year: 2024, equity: 900 }),
    ]);
    await checkedYesterday(ALTA_TOURS);

    await runAccountsCheck();

    const rows = await AnnualAccountsRecord.findAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      brregId: "7",
      figures: expect.objectContaining({ equity: 900 }),
    });
    expect((await changesOf(ALTA_TOURS)).map((c) => c.field)).toEqual([
      "annualAccounts.corrected",
    ]);
  });

  it("keeps accounts that Brreg no longer lists", async () => {
    const { auth } = await follow(ALTA_TOURS, "ALTA TOURS AS", [
      { id: 3, year: 2024 },
      { id: 2, year: 2023 },
      { id: 1, year: 2022 },
    ]);
    // A new year arrives and Brreg drops the oldest one
    brreg.setAccounts(ALTA_TOURS, [
      brregRegnskap({ id: 4, year: 2025 }),
      brregRegnskap({ id: 3, year: 2024 }),
      brregRegnskap({ id: 2, year: 2023 }),
    ]);
    await checkedYesterday(ALTA_TOURS);
    await runAccountsCheck();

    const res = await request(app)
      .get(`/api/watchlist/${ALTA_TOURS}/accounts`)
      .set(auth);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("available");
    expect(res.body.accounts.map((a: { year: number }) => a.year)).toEqual([
      2025, 2024, 2023, 2022,
    ]);
  });

  it("goes on with the other companies when one fails, and retries it next time", async () => {
    const { auth } = await follow(ALTA_TOURS, "ALTA TOURS AS", [
      { id: 1, year: 2024 },
    ]);
    brreg.setActive(brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS"));
    brreg.setAccounts(ARCTIC_FISH, [brregRegnskap({ id: 11, year: 2024 })]);
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ARCTIC_FISH })
      .expect(201);
    await checkedYesterday(ALTA_TOURS);
    await checkedYesterday(ARCTIC_FISH);

    brreg.setAccountsError(ALTA_TOURS, 503, "Service Unavailable");
    brreg.setAccounts(ARCTIC_FISH, [
      brregRegnskap({ id: 12, year: 2025 }),
      brregRegnskap({ id: 11, year: 2024 }),
    ]);

    const failed = await runAccountsCheck();

    expect(failed).toEqual({
      companiesChecked: 1,
      changesFound: 1,
      failedCompanies: 1,
    });

    brreg.setAccounts(ALTA_TOURS, [
      brregRegnskap({ id: 2, year: 2025 }),
      brregRegnskap({ id: 1, year: 2024 }),
    ]);
    const retried = await runAccountsCheck();

    expect(retried).toEqual({
      companiesChecked: 1,
      changesFound: 1,
      failedCompanies: 0,
    });
    expect((await changesOf(ALTA_TOURS)).map((c) => c.field)).toEqual([
      "annualAccounts.filed",
    ]);
  });

  it("does not check companies that have been struck off", async () => {
    await follow(ALTA_TOURS, "ALTA TOURS AS", [{ id: 1, year: 2024 }]);
    await CompanyRecord.update(
      { deletedFromRegistryAt: new Date(), accountsCheckedAt: null },
      { where: { orgNumber: ALTA_TOURS } },
    );

    const summary = await runAccountsCheck();

    expect(summary.companiesChecked).toBe(0);
  });

  it("saves nothing when the notifications cannot be saved, and records it on the next run", async () => {
    await follow(ALTA_TOURS, "ALTA TOURS AS", [{ id: 1, year: 2024 }]);
    brreg.setAccounts(ALTA_TOURS, [
      brregRegnskap({ id: 2, year: 2025 }),
      brregRegnskap({ id: 1, year: 2024 }),
    ]);
    await checkedYesterday(ALTA_TOURS);
    const checkedBefore = (await record(ALTA_TOURS)).accountsCheckedAt;

    const failingInsert = vi
      .spyOn(Notification, "bulkCreate")
      .mockRejectedValueOnce(new Error("Database unavailable"));
    const failed = await runAccountsCheck();
    failingInsert.mockRestore();

    expect(failed.failedCompanies).toBe(1);
    expect(await CompanyChange.count()).toBe(0);
    expect(await AnnualAccountsRecord.count()).toBe(1);
    expect((await record(ALTA_TOURS)).accountsCheckedAt).toEqual(checkedBefore);

    const recovered = await runAccountsCheck();

    expect(recovered.changesFound).toBe(1);
    expect(await AnnualAccountsRecord.count()).toBe(2);
  });
});

describe("GET /api/watchlist/:orgNumber/accounts", () => {
  it("returns 404 for a company that is not on the watchlist", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .get(`/api/watchlist/${ALTA_TOURS}/accounts`)
      .set(auth);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get(`/api/watchlist/${ALTA_TOURS}/accounts`);

    expect(res.status).toBe(401);
  });

  it("returns 400 for an organization number that is not 9 digits", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).get("/api/watchlist/123/accounts").set(auth);

    expect(res.status).toBe(400);
  });
});

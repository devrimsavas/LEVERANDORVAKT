import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import {
  assessRisk,
  latestDueAccountsYear,
  riskLevel,
} from "../src/services/riskAssessment.js";
import { runAccountsCheck } from "../src/services/accountsService.js";
import { runChangeDetection } from "../src/services/changeDetectionService.js";
import { toAnnualAccounts } from "../src/mappers/annualAccountsMapper.js";
import { CompanyRecord } from "../src/models/CompanyRecord.js";
import { CompanyChange } from "../src/models/CompanyChange.js";
import { Notification } from "../src/models/Notification.js";
import type { Company } from "../src/types/company.js";
import type {
  AnnualAccounts,
  AnnualAccountsFigures,
} from "../src/types/annualAccounts.js";
import type { RiskHistoryChange, RiskInput } from "../src/types/risk.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import {
  brregEnhet,
  brregRegnskap,
  useFakeBrreg,
} from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";
const ARCTIC_FISH = "923456789";

// Every test of the rules runs on the same day, so the results never
// depend on when the tests are run
const NOW = new Date("2026-11-11T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

function company(overrides: Partial<Company> = {}): Company {
  return {
    orgNumber: ALTA_TOURS,
    name: "ALTA TOURS AS",
    organizationForm: "AS",
    website: null,
    address: null,
    industryCode: null,
    industryDescription: null,
    employees: 12,
    foundedDate: "2015-03-01",
    isBankrupt: false,
    isUnderLiquidation: false,
    isUnderForcedLiquidation: false,
    // Up to date: accounts for 2025 were due by 31 July 2026
    lastAnnualAccountsYear: 2025,
    ...overrides,
  };
}

// The company's own accounts for a year, with healthy figures unless overridden
function own(
  year: number,
  figures: Partial<AnnualAccountsFigures> = {},
  flags: Partial<
    Pick<AnnualAccounts, "liquidation" | "auditOptedOut" | "type">
  > = {},
): AnnualAccounts {
  const accounts = toAnnualAccounts(brregRegnskap({ id: year, year }));
  return {
    ...accounts,
    ...flags,
    figures: {
      ...accounts.figures,
      totalAssets: 10000000,
      equity: 5000000,
      netProfit: 1000000,
      ...figures,
    },
  };
}

function change(
  field: string,
  daysBefore: number,
  oldValue: unknown = "Old",
  newValue: unknown = "New",
): RiskHistoryChange {
  return { field, oldValue, newValue, detectedAt: daysAgo(daysBefore) };
}

// A healthy, followed company; each test changes what it needs
function input(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    orgNumber: ALTA_TOURS,
    name: "ALTA TOURS AS",
    company: company(),
    struckOff: null,
    accounts: { status: "available", list: [own(2025), own(2024)] },
    history: { since: new Date("2024-01-01"), changes: [] },
    ...overrides,
  };
}

const codes = (risk: { signals: { code: string }[] }) =>
  risk.signals.map((s) => s.code);
const limitationCodes = (risk: { limitations: { code: string }[] }) =>
  risk.limitations.map((l) => l.code);

describe("assessRisk", () => {
  it("gives a healthy company a low risk with no signals", () => {
    const risk = assessRisk(input(), NOW);

    expect(risk).toMatchObject({
      level: "low",
      score: 0,
      signals: [],
      limitations: [],
    });
    expect(risk.assessedAt).toBe(NOW.toISOString());
    expect(risk.disclaimer).toMatch(/Not a credit rating/);
  });

  describe("critical signals", () => {
    it.each([
      ["BANKRUPT", { company: company({ isBankrupt: true }) }],
      ["UNDER_LIQUIDATION", { company: company({ isUnderLiquidation: true }) }],
      [
        "FORCED_LIQUIDATION",
        { company: company({ isUnderForcedLiquidation: true }) },
      ],
      ["STRUCK_OFF", { struckOff: { date: "2026-10-01" } }],
      [
        "LIQUIDATION_ACCOUNTS",
        {
          accounts: {
            status: "available" as const,
            list: [own(2025, {}, { liquidation: true })],
          },
        },
      ],
    ])("%s sets the level to high on its own", (code, overrides) => {
      const risk = assessRisk(input(overrides), NOW);

      expect(risk.level).toBe("high");
      expect(risk.score).toBe(0);
      expect(risk.signals[0]).toMatchObject({
        code,
        severity: "critical",
        points: 0,
      });
    });
  });

  describe("overdue annual accounts", () => {
    it("flags accounts that were due by 31 July and have not been filed", () => {
      const risk = assessRisk(
        input({ company: company({ lastAnnualAccountsYear: 2024 }) }),
        NOW,
      );

      expect(risk).toMatchObject({ level: "medium", score: 25 });
      expect(risk.signals[0]).toMatchObject({
        code: "ACCOUNTS_OVERDUE",
        title: "Annual accounts for 2025 are overdue",
      });
      expect(risk.signals[0]!.detail).toContain("31 July 2026");
    });

    it("counts a year as due only after 31 July of the next year", () => {
      expect(latestDueAccountsYear(new Date("2026-07-31T12:00:00Z"))).toBe(
        2024,
      );
      expect(latestDueAccountsYear(new Date("2026-08-01T12:00:00Z"))).toBe(
        2025,
      );
    });

    it("gives a stronger signal, instead of the overdue one, when two years are missing", () => {
      const risk = assessRisk(
        input({ company: company({ lastAnnualAccountsYear: 2023 }) }),
        NOW,
      );

      expect(codes(risk)).toEqual(["ACCOUNTS_MISSING_TWO_YEARS"]);
      expect(risk).toMatchObject({ level: "high", score: 40 });
    });

    it("flags a company that has never filed accounts", () => {
      const risk = assessRisk(
        input({ company: company({ lastAnnualAccountsYear: null }) }),
        NOW,
      );

      expect(codes(risk)).toEqual(["ACCOUNTS_MISSING_TWO_YEARS"]);
    });

    it("expects accounts only for years the company existed in", () => {
      const foundedLastYear = assessRisk(
        input({
          company: company({
            foundedDate: "2025-06-01",
            lastAnnualAccountsYear: null,
          }),
        }),
        NOW,
      );
      const foundedThisYear = assessRisk(
        input({
          company: company({
            foundedDate: "2026-03-01",
            lastAnnualAccountsYear: null,
          }),
        }),
        NOW,
      );

      expect(codes(foundedLastYear)).toEqual(["ACCOUNTS_OVERDUE"]);
      expect(codes(foundedThisYear)).toEqual(["YOUNG_COMPANY"]);
    });

    it("does not check company forms that do not have to file accounts", () => {
      const risk = assessRisk(
        input({
          company: company({
            organizationForm: "ENK",
            lastAnnualAccountsYear: null,
          }),
        }),
        NOW,
      );

      expect(risk.signals).toEqual([]);
    });

    it("lists a limitation when the founding date is unknown", () => {
      const risk = assessRisk(
        input({
          company: company({ foundedDate: null, lastAnnualAccountsYear: null }),
        }),
        NOW,
      );

      expect(risk.signals).toEqual([]);
      expect(limitationCodes(risk)).toEqual(["ACCOUNTS_DEADLINE_UNKNOWN"]);
    });

    it("does not flag a struck-off company as overdue", () => {
      const risk = assessRisk(
        input({
          struckOff: { date: null },
          company: company({ lastAnnualAccountsYear: 2020 }),
        }),
        NOW,
      );

      expect(codes(risk)).toEqual(["STRUCK_OFF"]);
    });
  });

  describe("key figures", () => {
    const withAccounts = (...list: AnnualAccounts[]) =>
      input({ accounts: { status: "available", list } });

    it("flags negative equity", () => {
      const risk = assessRisk(
        withAccounts(own(2025, { equity: -250000 })),
        NOW,
      );

      expect(risk).toMatchObject({ level: "medium", score: 30 });
      expect(risk.signals[0]!.detail).toContain("-250,000 NOK");
    });

    it("flags a low equity ratio, but not together with negative equity", () => {
      const low = assessRisk(
        withAccounts(own(2025, { equity: 500000, totalAssets: 10000000 })),
        NOW,
      );

      expect(codes(low)).toEqual(["LOW_EQUITY_RATIO"]);
      expect(low.signals[0]!.detail).toContain("5 %");
    });

    it("flags losses two years in a row more strongly than one", () => {
      const twoYears = assessRisk(
        withAccounts(
          own(2025, { netProfit: -1 }),
          own(2024, { netProfit: -1 }),
        ),
        NOW,
      );
      const oneYear = assessRisk(
        withAccounts(own(2025, { netProfit: -1 }), own(2024)),
        NOW,
      );

      expect(twoYears.signals.map((s) => [s.code, s.points])).toEqual([
        ["LOSS_TWO_YEARS", 20],
      ]);
      expect(oneYear.signals.map((s) => [s.code, s.points])).toEqual([
        ["LOSS_LAST_YEAR", 10],
      ]);
    });

    it("counts losses as two years in a row only for consecutive years", () => {
      const risk = assessRisk(
        withAccounts(
          own(2025, { netProfit: -1 }),
          own(2022, { netProfit: -1 }),
        ),
        NOW,
      );

      expect(codes(risk)).toEqual(["LOSS_LAST_YEAR"]);
    });

    it("uses the company's own accounts, not the group's", () => {
      const risk = assessRisk(
        // The group's accounts come first, so they would be picked if not filtered out
        withAccounts(
          own(
            2025,
            { equity: -1, netProfit: -1 },
            { type: "group", liquidation: true },
          ),
          own(2025),
        ),
        NOW,
      );

      expect(risk.signals).toEqual([]);
    });

    it("notes an opted-out audit without giving it points", () => {
      const risk = assessRisk(
        withAccounts(own(2025, {}, { auditOptedOut: true })),
        NOW,
      );

      expect(risk.signals.map((s) => [s.code, s.severity, s.points])).toEqual([
        ["AUDIT_OPTED_OUT", "info", 0],
      ]);
      expect(risk.level).toBe("low");
    });

    it.each([
      ["unsupported", "ACCOUNTS_NOT_COVERED"],
      ["unknown", "ACCOUNTS_UNAVAILABLE"],
    ] as const)(
      "lists a limitation when the accounts are %s",
      (status, code) => {
        const risk = assessRisk(input({ accounts: { status, list: [] } }), NOW);

        expect(limitationCodes(risk)).toEqual([code]);
      },
    );
  });

  describe("change history", () => {
    const withChanges = (...changes: RiskHistoryChange[]) =>
      input({ history: { since: new Date("2024-01-01"), changes } });

    it("flags an auditor leaving or being replaced, but not a new auditor being added", () => {
      expect(
        codes(
          assessRisk(
            withChanges(
              change("roles.auditor", 30, "NORDLYS REVISJON AS", null),
            ),
            NOW,
          ),
        ),
      ).toEqual(["AUDITOR_LEFT"]);
      expect(
        codes(
          assessRisk(
            withChanges(
              change("roles.auditor", 30, null, "NORDLYS REVISJON AS"),
            ),
            NOW,
          ),
        ),
      ).toEqual([]);
    });

    it("flags two or more CEO changes within 12 months", () => {
      const once = assessRisk(withChanges(change("roles.ceo", 10)), NOW);
      const twice = assessRisk(
        withChanges(change("roles.ceo", 10), change("roles.ceo", 200)),
        NOW,
      );

      expect(codes(once)).toEqual([]);
      expect(twice.signals.map((s) => [s.code, s.points])).toEqual([
        ["FREQUENT_CEO_CHANGES", 15],
      ]);
    });

    it("flags frequent address changes", () => {
      const risk = assessRisk(
        withChanges(change("address", 10), change("address", 100)),
        NOW,
      );

      expect(codes(risk)).toEqual(["FREQUENT_ADDRESS_CHANGES"]);
    });

    it("ignores changes older than 12 months", () => {
      const risk = assessRisk(
        withChanges(change("roles.ceo", 10), change("roles.ceo", 400)),
        NOW,
      );

      expect(risk.signals).toEqual([]);
    });

    it("lists a limitation when the company is not followed", () => {
      const risk = assessRisk(input({ history: null }), NOW);

      expect(limitationCodes(risk)).toEqual(["CHANGE_HISTORY_UNKNOWN"]);
    });

    it("lists a limitation when the company has been followed for less than 12 months", () => {
      const risk = assessRisk(
        input({ history: { since: daysAgo(30), changes: [] } }),
        NOW,
      );

      expect(limitationCodes(risk)).toEqual(["CHANGE_HISTORY_PARTIAL"]);
      expect(risk.limitations[0]!.reason).toContain("2026-10-12");
    });
  });

  it("flags a company less than a year old", () => {
    const risk = assessRisk(
      input({ company: company({ foundedDate: "2026-05-01" }) }),
      NOW,
    );

    expect(codes(risk)).toContain("YOUNG_COMPANY");
  });

  it("adds up the points, most serious signals first, up to 100", () => {
    const risk = assessRisk(
      input({
        company: company({ lastAnnualAccountsYear: 2023, isBankrupt: true }),
        accounts: {
          status: "available",
          list: [
            own(2025, { equity: -1, netProfit: -1 }),
            own(2024, { netProfit: -1 }),
          ],
        },
        history: {
          since: new Date("2024-01-01"),
          changes: [
            change("roles.ceo", 5),
            change("roles.ceo", 50),
            change("roles.auditor", 5, "A", null),
          ],
        },
      }),
      NOW,
    );

    expect(codes(risk)).toEqual([
      "BANKRUPT",
      "ACCOUNTS_MISSING_TWO_YEARS",
      "NEGATIVE_EQUITY",
      "LOSS_TWO_YEARS",
      "AUDITOR_LEFT",
      "FREQUENT_CEO_CHANGES",
    ]);
    expect(risk.score).toBe(100);
  });

  it.each([
    [0, false, "low"],
    [19, false, "low"],
    [20, false, "medium"],
    [39, false, "medium"],
    [40, false, "high"],
    [0, true, "high"],
  ] as const)(
    "score %i with critical=%s gives %s",
    (score, critical, level) => {
      expect(riskLevel(score, critical)).toBe(level);
    },
  );
});

describe("GET /api/companies/:orgNumber/risk", () => {
  // Only Date is faked; real timers keep the database and HTTP working
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("assesses a company that is not followed from live data", async () => {
    brreg.setActive(
      brregEnhet(ALTA_TOURS, "ALTA TOURS AS", {
        sisteInnsendteAarsregnskap: "2025",
      }),
    );
    brreg.setAccounts(ALTA_TOURS, [
      brregRegnskap({ id: 1, year: 2025, equity: -100000 }),
    ]);

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/risk`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      orgNumber: ALTA_TOURS,
      name: "ALTA TOURS AS",
      level: "medium",
      score: 30,
    });
    expect(codes(res.body)).toEqual(["NEGATIVE_EQUITY"]);
    expect(limitationCodes(res.body)).toEqual(["CHANGE_HISTORY_UNKNOWN"]);
  });

  it("assesses a struck-off company as high risk", async () => {
    brreg.setDeleted(ALTA_TOURS, "2026-10-01");

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/risk`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: null, level: "high" });
    expect(res.body.signals[0].detail).toContain("2026-10-01");
  });

  it("still assesses the company when the accounts cannot be fetched", async () => {
    brreg.setActive(
      brregEnhet(ALTA_TOURS, "ALTA TOURS AS", {
        sisteInnsendteAarsregnskap: "2025",
      }),
    );
    brreg.setAccountsError(ALTA_TOURS, 503, "Service Unavailable");

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/risk`);

    expect(res.status).toBe(200);
    expect(limitationCodes(res.body)).toContain("ACCOUNTS_UNAVAILABLE");
  });

  it("returns 404 for a company that does not exist", async () => {
    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/risk`);

    expect(res.status).toBe(404);
  });

  it("returns 502 when the company register is not available", async () => {
    brreg.setError(ALTA_TOURS, 503);

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/risk`);

    expect(res.status).toBe(502);
  });

  it("returns 400 for an organization number that is not 9 digits", async () => {
    const res = await request(app).get("/api/companies/123/risk");

    expect(res.status).toBe(400);
  });
});

describe("risk on the watchlist", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function follow(auth: Record<string, string>, orgNumber: string) {
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber })
      .expect(201);
  }

  it("assesses a company when it is followed, as the starting point", async () => {
    brreg.setActive(
      brregEnhet(ALTA_TOURS, "ALTA TOURS AS", {
        sisteInnsendteAarsregnskap: "2024",
      }),
    );
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS });

    expect(res.body.risk).toMatchObject({ level: "medium", score: 25 });
    expect(await CompanyChange.count()).toBe(0);
  });

  it("gives the full report of a followed company, including its change history", async () => {
    brreg.setActive(
      brregEnhet(ALTA_TOURS, "ALTA TOURS AS", {
        sisteInnsendteAarsregnskap: "2025",
      }),
    );
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS);

    const res = await request(app)
      .get(`/api/watchlist/${ALTA_TOURS}/risk`)
      .set(auth);

    expect(res.status).toBe(200);
    expect(res.body.level).toBe("low");
    // Followed today: the history is known, but only from today
    expect(limitationCodes(res.body)).toEqual(["CHANGE_HISTORY_PARTIAL"]);
  });

  it("sorts the watchlist by risk, highest first", async () => {
    brreg.setActive(
      brregEnhet(ALTA_TOURS, "ALTA TOURS AS", {
        sisteInnsendteAarsregnskap: "2025",
      }),
    );
    brreg.setActive(
      brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS", {
        sisteInnsendteAarsregnskap: "2023",
      }),
    );
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS);
    await follow(auth, ARCTIC_FISH);

    const byName = await request(app).get("/api/watchlist").set(auth);
    const byRisk = await request(app).get("/api/watchlist?sort=risk").set(auth);

    expect(
      byName.body.map((i: { company: { name: string } }) => i.company.name),
    ).toEqual(["ALTA TOURS AS", "ARCTIC FISH AS"]);
    expect(
      byRisk.body.map((i: { company: { name: string } }) => i.company.name),
    ).toEqual(["ARCTIC FISH AS", "ALTA TOURS AS"]);
  });

  it("returns 400 for an unknown sort order", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app).get("/api/watchlist?sort=size").set(auth);

    expect(res.status).toBe(400);
  });

  it("returns 404 for the risk of a company that is not on the watchlist", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);
    const { auth: kariAuth } = await registerAndLogin(kari);
    await follow(kariAuth, ALTA_TOURS);

    const res = await request(app)
      .get(`/api/watchlist/${ALTA_TOURS}/risk`)
      .set(auth);

    expect(res.status).toBe(404);
  });
});

describe("early warning when the risk level rises", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Lukas follows Alta Tours, whose latest filed accounts are for 2024
  async function followAltaToursFiledUpTo2024() {
    brreg.setActive(
      brregEnhet(ALTA_TOURS, "ALTA TOURS AS", {
        sisteInnsendteAarsregnskap: "2024",
      }),
    );
    const { auth } = await registerAndLogin(lukas);
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS })
      .expect(201);
  }

  it("notifies the follower when the risk rises just because time passed", async () => {
    // Followed in July: the 2025 accounts are not due yet
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
    await followAltaToursFiledUpTo2024();
    expect(
      (await CompanyRecord.findOne({ rejectOnEmpty: true })).riskLevel,
    ).toBe("low");

    // 1 August passes without the accounts being filed
    vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));
    const summary = await runAccountsCheck();

    // Not an accounts change, but it is recorded and notified
    expect(summary.changesFound).toBe(0);
    const changes = await CompanyChange.findAll();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      field: "riskLevel",
      oldValue: { level: "low", score: 0 },
      newValue: { level: "medium", score: 25, signals: ["ACCOUNTS_OVERDUE"] },
      severity: "warning",
    });
    expect(await Notification.count()).toBe(1);
    expect(
      (await CompanyRecord.findOne({ rejectOnEmpty: true })).riskLevel,
    ).toBe("medium");
  });

  it("records a falling risk level without notifying", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await followAltaToursFiledUpTo2024();
    await runChangeDetection(); // the first run only records the starting point

    // The overdue accounts are filed; the register shows the new year
    brreg.setActive(
      brregEnhet(ALTA_TOURS, "ALTA TOURS AS", {
        sisteInnsendteAarsregnskap: "2025",
      }),
    );
    brreg.addUpdate(ALTA_TOURS);
    await runChangeDetection();

    const changes = await CompanyChange.findAll({ order: [["id", "ASC"]] });
    expect(changes.map((c) => c.field)).toEqual([
      "lastAnnualAccountsYear",
      "riskLevel",
    ]);
    expect(changes[1]).toMatchObject({
      oldValue: { level: "medium", score: 25 },
      newValue: { level: "low", score: 0 },
      severity: "info",
    });
    // Only the filing is notified
    expect(await Notification.count()).toBe(1);
  });
});

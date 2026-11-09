import { describe, expect, it } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import app from "../src/app.js";
import {
  toAnnualAccounts,
  toAnnualAccountsList,
} from "../src/mappers/annualAccountsMapper.js";
import type { BrregRegnskap } from "../src/types/regnskap.js";
import { brregEnhet, useFakeBrreg } from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";

// A fictional company with the same structure as a real accounts response:
// the 2025 group accounts, then the company's own 2024 and 2025 accounts
const regnskapFixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/brregRegnskap.json", import.meta.url),
    "utf-8",
  ),
) as BrregRegnskap[];

const [group2025, company2024, company2025] = regnskapFixture as [
  BrregRegnskap,
  BrregRegnskap,
  BrregRegnskap,
];

const BANK_MESSAGE =
  "Regnskapet inneholder en oppstillingsplan som ikke er stottet (BANK)";

describe("toAnnualAccounts", () => {
  it("maps a real-shaped Brreg response to the app's shape", () => {
    expect(toAnnualAccounts(company2025)).toEqual({
      brregId: 7100001,
      year: 2025,
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      type: "company",
      currency: "NOK",
      accountingRules: "NGAAP",
      audited: true,
      auditOptedOut: false,
      liquidation: false,
      figures: {
        revenue: 67000000,
        operatingExpenses: 59700000,
        operatingProfit: 7300000,
        netFinancialItems: -300000,
        profitBeforeTax: 7000000,
        taxExpense: 1540000,
        netProfit: 5460000,
        totalAssets: 52000000,
        fixedAssets: 37000000,
        currentAssets: 15000000,
        cash: 8000000,
        equity: 20000000,
        totalDebt: 32000000,
        shortTermDebt: 13000000,
        longTermDebt: 19000000,
      },
    });
  });

  it("maps group accounts as type 'group'", () => {
    expect(toAnnualAccounts(group2025).type).toBe("group");
  });

  it("gives null for figures Brreg leaves out", () => {
    // The 2024 accounts have no cash figure
    expect(toAnnualAccounts(company2024).figures.cash).toBeNull();
  });

  it("works when only the required fields are present", () => {
    const accounts = toAnnualAccounts({
      id: 1,
      regnskapstype: "SELSKAP",
      regnskapsperiode: { fraDato: "2025-01-01", tilDato: "2025-12-31" },
    });

    expect(accounts).toMatchObject({
      currency: null,
      accountingRules: null,
      audited: true,
      auditOptedOut: false,
      liquidation: false,
    });
    expect(Object.values(accounts.figures).every((v) => v === null)).toBe(true);
  });

  it("keeps the currency the accounts were reported in", () => {
    expect(toAnnualAccounts({ ...company2025, valuta: "USD" }).currency).toBe(
      "USD",
    );
  });

  it("maps the warning signs", () => {
    const accounts = toAnnualAccounts({
      ...company2025,
      avviklingsregnskap: true,
      revisjon: { ikkeRevidertAarsregnskap: true, fravalgRevisjon: true },
    });

    expect(accounts).toMatchObject({
      audited: false,
      auditOptedOut: true,
      liquidation: true,
    });
  });

  it("takes the year from the end of the accounting period", () => {
    const accounts = toAnnualAccounts({
      ...company2025,
      regnskapsperiode: { fraDato: "2024-07-01", tilDato: "2025-06-30" },
    });

    expect(accounts.year).toBe(2025);
  });
});

describe("toAnnualAccountsList", () => {
  it("sorts newest first, with the company's own accounts before the group's", () => {
    const list = toAnnualAccountsList(regnskapFixture);

    expect(list.map((a) => [a.year, a.type])).toEqual([
      [2025, "company"],
      [2025, "group"],
      [2024, "company"],
    ]);
  });
});

describe("GET /api/companies/:orgNumber/accounts", () => {
  it("returns the accounts from Brreg, newest first", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    brreg.setAccounts(ALTA_TOURS, regnskapFixture);

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/accounts`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("available");
    expect(
      res.body.accounts.map((a: { brregId: number }) => a.brregId),
    ).toEqual([7100001, 7100002, 5600001]);
    expect(res.body.accounts[0].figures.netProfit).toBe(5460000);
  });

  it("returns an empty list for a company that has not filed any accounts", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/accounts`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "available", accounts: [] });
  });

  it("returns 'unsupported' for a company the accounts register does not cover", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA BANK ASA"));
    brreg.setAccountsError(ALTA_TOURS, 500, BANK_MESSAGE);

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/accounts`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "unsupported", accounts: [] });
  });

  it("still returns the accounts of a company that has been struck off", async () => {
    brreg.setDeleted(ALTA_TOURS, "2026-11-08");
    brreg.setAccounts(ALTA_TOURS, [company2024]);

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/accounts`);

    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(1);
  });

  it("returns 404 for a company that does not exist, without asking the accounts register", async () => {
    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/accounts`);

    expect(res.status).toBe(404);
    expect(
      brreg.requests.some((url) =>
        url.pathname.includes("regnskapsregisteret"),
      ),
    ).toBe(false);
  });

  it.each([
    ["an internal error", 500, "Something went wrong"],
    ["an unavailable service", 503, "Service Unavailable"],
  ])(
    "returns 502 when the accounts register answers with %s",
    async (_case, status, message) => {
      brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
      brreg.setAccountsError(ALTA_TOURS, status, message);

      const res = await request(app).get(
        `/api/companies/${ALTA_TOURS}/accounts`,
      );

      expect(res.status).toBe(502);
    },
  );

  it("returns 502 when the company register is not available", async () => {
    brreg.setError(ALTA_TOURS, 503);

    const res = await request(app).get(`/api/companies/${ALTA_TOURS}/accounts`);

    expect(res.status).toBe(502);
  });

  it("returns 400 for an organization number that is not 9 digits", async () => {
    const res = await request(app).get("/api/companies/12345/accounts");

    expect(res.status).toBe(400);
  });
});

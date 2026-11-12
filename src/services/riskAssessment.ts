import type { AnnualAccounts } from "../types/annualAccounts.js";
import type {
  RiskAssessment,
  RiskInput,
  RiskLevel,
  RiskLimitation,
  RiskParams,
  RiskSignal,
  RiskSignalCode,
} from "../types/risk.js";

// All weights and thresholds in one place. Changing a rule is a one-line
// change here, and the tests show which behaviour changed.
export const RISK_RULES = {
  // Points per signal. Critical signals have no points: they set the level to "high".
  points: {
    // Two missing years is a much stronger sign than one; it replaces the overdue signal
    ACCOUNTS_OVERDUE: 25,
    ACCOUNTS_MISSING_TWO_YEARS: 40,
    // Debts larger than assets: the company owes more than it owns
    NEGATIVE_EQUITY: 30,
    // Little buffer against losses
    LOW_EQUITY_RATIO: 10,
    LOSS_TWO_YEARS: 20,
    LOSS_LAST_YEAR: 10,
    // An auditor leaving is one of the early signs of financial trouble
    AUDITOR_LEFT: 15,
    FREQUENT_CEO_CHANGES: 15,
    FREQUENT_ADDRESS_CHANGES: 10,
    // No track record yet
    YOUNG_COMPANY: 10,
  },
  // A score at or above these values gives the level
  levels: { high: 40, medium: 20 },
  maxScore: 100,
  // Equity below this share of total assets is a thin buffer
  lowEquityRatio: 0.1,
  // How far back changes count, and how many make them "frequent"
  historyDays: 365,
  frequentChanges: 2,
  youngCompanyDays: 365,
  // Accounts for a year are due by 31 July of the next year
  accountsDueMonth: 7,
  accountsDueDay: 31,
  // Company forms that must file annual accounts. Kept short on purpose:
  // a wrong "overdue" signal would be unfair to an honest company.
  accountsRequiredForms: ["AS", "ASA", "SA"],
} as const;

export const RISK_DISCLAIMER =
  "Based on public register data only. Not a credit rating.";

const DAY_MS = 24 * 60 * 60 * 1000;

// Signals that set the level to "high" on their own
const CRITICAL = new Set<RiskSignalCode>([
  "BANKRUPT",
  "UNDER_LIQUIDATION",
  "FORCED_LIQUIDATION",
  "STRUCK_OFF",
  "LIQUIDATION_ACCOUNTS",
]);

function signal(
  code: RiskSignalCode,
  title: string,
  detail: string,
  params: RiskParams = {},
): RiskSignal {
  const points =
    code in RISK_RULES.points
      ? RISK_RULES.points[code as keyof typeof RISK_RULES.points]
      : 0;
  const severity = CRITICAL.has(code)
    ? "critical"
    : points > 0
      ? "warning"
      : "info";
  return { code, severity, points, title, detail, params };
}

// The newest year whose accounts must have been filed by `now`
export function latestDueAccountsYear(now: Date): number {
  const year = now.getUTCFullYear();
  const deadline = Date.UTC(
    year,
    RISK_RULES.accountsDueMonth - 1,
    RISK_RULES.accountsDueDay,
    23,
    59,
    59,
  );
  return now.getTime() > deadline ? year - 1 : year - 2;
}

function formatDeadline(year: number): string {
  return `${RISK_RULES.accountsDueDay} July ${year + 1}`;
}

// The filing deadline for a year's accounts as an ISO date, e.g. 2026-07-31
function deadlineDate(year: number): string {
  const month = String(RISK_RULES.accountsDueMonth).padStart(2, "0");
  const day = String(RISK_RULES.accountsDueDay).padStart(2, "0");
  return `${year + 1}-${month}-${day}`;
}

function registerSignals(input: RiskInput): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const company = input.company;

  if (input.struckOff) {
    signals.push(
      signal(
        "STRUCK_OFF",
        "Struck off the register",
        input.struckOff.date
          ? `The company was struck off the Central Coordinating Register on ${input.struckOff.date}.`
          : "The company has been struck off the Central Coordinating Register.",
        { date: input.struckOff.date },
      ),
    );
  }
  if (company?.isBankrupt) {
    signals.push(
      signal(
        "BANKRUPT",
        "Bankrupt",
        "Bankruptcy proceedings have been opened.",
      ),
    );
  }
  if (company?.isUnderLiquidation) {
    signals.push(
      signal(
        "UNDER_LIQUIDATION",
        "Being wound up",
        "The company is under voluntary liquidation.",
      ),
    );
  }
  if (company?.isUnderForcedLiquidation) {
    signals.push(
      signal(
        "FORCED_LIQUIDATION",
        "Forced liquidation",
        "The company is under forced liquidation or forced dissolution.",
      ),
    );
  }
  return signals;
}

function youngCompanySignal(input: RiskInput, now: Date): RiskSignal[] {
  const founded = input.company?.foundedDate;
  if (!founded) {
    return [];
  }
  const ageDays = (now.getTime() - Date.parse(founded)) / DAY_MS;
  return ageDays < RISK_RULES.youngCompanyDays
    ? [
        signal(
          "YOUNG_COMPANY",
          "Less than a year old",
          `The company was founded on ${founded} and has no track record yet.`,
          { foundedDate: founded },
        ),
      ]
    : [];
}

// Late filing, from the register's "last annual accounts" year.
// Works for every company, also those the accounts register does not cover.
function filingSignals(
  input: RiskInput,
  now: Date,
  limitations: RiskLimitation[],
): RiskSignal[] {
  const company = input.company;
  if (
    !company ||
    input.struckOff ||
    !(RISK_RULES.accountsRequiredForms as readonly string[]).includes(
      company.organizationForm,
    )
  ) {
    return [];
  }

  if (!company.foundedDate) {
    limitations.push({
      code: "ACCOUNTS_DEADLINE_UNKNOWN",
      reason:
        "The founding date is unknown, so overdue accounts cannot be checked.",
      params: {},
    });
    return [];
  }

  const dueYear = latestDueAccountsYear(now);
  const foundedYear = Number(company.foundedDate.slice(0, 4));
  // Accounts are only expected for years the company existed in
  const isExpected = (year: number) => foundedYear <= year;
  const last = company.lastAnnualAccountsYear;
  const lastText =
    last === null
      ? "No accounts have been filed."
      : `The latest filed accounts are for ${last}.`;

  if (isExpected(dueYear - 1) && (last === null || last < dueYear - 1)) {
    return [
      signal(
        "ACCOUNTS_MISSING_TWO_YEARS",
        `Annual accounts for ${dueYear - 1} and ${dueYear} are missing`,
        `Accounts for ${dueYear} were due by ${formatDeadline(dueYear)}. ${lastText}`,
        {
          firstMissingYear: dueYear - 1,
          dueYear,
          deadline: deadlineDate(dueYear),
          lastFiledYear: last,
        },
      ),
    ];
  }
  if (isExpected(dueYear) && (last === null || last < dueYear)) {
    return [
      signal(
        "ACCOUNTS_OVERDUE",
        `Annual accounts for ${dueYear} are overdue`,
        `Accounts for ${dueYear} were due by ${formatDeadline(dueYear)}. ${lastText}`,
        {
          dueYear,
          deadline: deadlineDate(dueYear),
          lastFiledYear: last,
        },
      ),
    ];
  }
  return [];
}

function money(value: number, currency: string | null): string {
  return `${value.toLocaleString("en-US")} ${currency ?? ""}`.trim();
}

// Signals from the key figures of the company's own accounts
function accountsSignals(
  input: RiskInput,
  limitations: RiskLimitation[],
): RiskSignal[] {
  if (input.accounts.status === "unsupported") {
    limitations.push({
      code: "ACCOUNTS_NOT_COVERED",
      reason:
        "The accounts register does not give key figures for this kind of company (e.g. banks).",
      params: {},
    });
    return [];
  }
  if (input.accounts.status === "unknown") {
    limitations.push({
      code: "ACCOUNTS_UNAVAILABLE",
      reason:
        "The annual accounts could not be fetched, so the key figures were not checked.",
      params: {},
    });
    return [];
  }

  // Newest first; the group's accounts are not used: liability lies with the company itself
  const own: AnnualAccounts[] = input.accounts.list
    .filter((accounts) => accounts.type === "company")
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const latest = own[0];
  if (!latest) {
    return [];
  }

  const signals: RiskSignal[] = [];
  const { equity, totalAssets, netProfit } = latest.figures;

  if (latest.liquidation) {
    signals.push(
      signal(
        "LIQUIDATION_ACCOUNTS",
        "Liquidation accounts",
        `The accounts for ${latest.year} were drawn up because the company is being wound up.`,
        { year: latest.year },
      ),
    );
  }

  if (equity !== null && equity < 0) {
    signals.push(
      signal(
        "NEGATIVE_EQUITY",
        "Negative equity",
        `Equity was ${money(equity, latest.currency)} at the end of ${latest.year}: debts are larger than assets.`,
        { year: latest.year, equity, currency: latest.currency },
      ),
    );
  } else if (
    equity !== null &&
    totalAssets !== null &&
    totalAssets > 0 &&
    equity / totalAssets < RISK_RULES.lowEquityRatio
  ) {
    const ratio = Math.round((equity / totalAssets) * 1000) / 10;
    signals.push(
      signal(
        "LOW_EQUITY_RATIO",
        "Low equity ratio",
        `Equity was ${ratio} % of total assets at the end of ${latest.year}.`,
        { year: latest.year, ratio },
      ),
    );
  }

  const previous = own[1];
  if (netProfit !== null && netProfit < 0) {
    const previousLoss =
      previous !== undefined &&
      previous.year === latest.year - 1 &&
      previous.figures.netProfit !== null &&
      previous.figures.netProfit < 0;

    signals.push(
      previousLoss
        ? signal(
            "LOSS_TWO_YEARS",
            "Losses two years in a row",
            `Net result was ${money(previous.figures.netProfit!, previous.currency)} in ${previous.year} and ${money(netProfit, latest.currency)} in ${latest.year}.`,
            {
              previousYear: previous.year,
              previousResult: previous.figures.netProfit,
              previousCurrency: previous.currency,
              year: latest.year,
              result: netProfit,
              currency: latest.currency,
            },
          )
        : signal(
            "LOSS_LAST_YEAR",
            "Loss last year",
            `Net result was ${money(netProfit, latest.currency)} in ${latest.year}.`,
            { year: latest.year, result: netProfit, currency: latest.currency },
          ),
    );
  }

  if (latest.auditOptedOut) {
    signals.push(
      signal(
        "AUDIT_OPTED_OUT",
        "Not audited",
        `The company has chosen not to have its accounts audited (${latest.year}). This is legal for small companies, but the figures have not been checked by an auditor.`,
        { year: latest.year },
      ),
    );
  }

  return signals;
}

// Signals from the recorded changes of a followed company
function historySignals(
  input: RiskInput,
  now: Date,
  limitations: RiskLimitation[],
): RiskSignal[] {
  if (!input.history) {
    limitations.push({
      code: "CHANGE_HISTORY_UNKNOWN",
      reason:
        "The company is not followed, so changes of CEO, auditor and address are unknown.",
      params: {},
    });
    return [];
  }

  const from = now.getTime() - RISK_RULES.historyDays * DAY_MS;
  if (input.history.since.getTime() > from) {
    limitations.push({
      code: "CHANGE_HISTORY_PARTIAL",
      reason: `Changes are known only since the company was first followed on ${input.history.since.toISOString().slice(0, 10)}.`,
      params: { since: input.history.since.toISOString().slice(0, 10) },
    });
  }

  const recent = input.history.changes.filter(
    (change) => change.detectedAt.getTime() >= from,
  );
  const count = (field: string) =>
    recent.filter((change) => change.field === field).length;
  const signals: RiskSignal[] = [];

  // A new auditor being added is not a warning; one leaving or being replaced is
  const auditorChanges = recent.filter(
    (change) => change.field === "roles.auditor" && change.oldValue !== null,
  );
  if (auditorChanges.length > 0) {
    signals.push(
      signal(
        "AUDITOR_LEFT",
        "Auditor left or was replaced",
        `The auditor changed ${auditorChanges.length === 1 ? "once" : `${auditorChanges.length} times`} in the last 12 months.`,
        { count: auditorChanges.length },
      ),
    );
  }

  const ceoChanges = count("roles.ceo");
  if (ceoChanges >= RISK_RULES.frequentChanges) {
    signals.push(
      signal(
        "FREQUENT_CEO_CHANGES",
        "Frequent CEO changes",
        `The CEO changed ${ceoChanges} times in the last 12 months.`,
        { count: ceoChanges },
      ),
    );
  }

  const addressChanges = count("address");
  if (addressChanges >= RISK_RULES.frequentChanges) {
    signals.push(
      signal(
        "FREQUENT_ADDRESS_CHANGES",
        "Frequent address changes",
        `The business address changed ${addressChanges} times in the last 12 months.`,
        { count: addressChanges },
      ),
    );
  }

  return signals;
}

export function riskLevel(score: number, hasCritical: boolean): RiskLevel {
  if (hasCritical || score >= RISK_RULES.levels.high) {
    return "high";
  }
  return score >= RISK_RULES.levels.medium ? "medium" : "low";
}

// Assesses a company from register data. Pure: the same input and date
// always give the same result, so `now` is a parameter.
export function assessRisk(input: RiskInput, now: Date): RiskAssessment {
  const limitations: RiskLimitation[] = [];

  const signals = [
    ...registerSignals(input),
    ...filingSignals(input, now, limitations),
    ...accountsSignals(input, limitations),
    ...historySignals(input, now, limitations),
    ...youngCompanySignal(input, now),
  ];

  // Most serious first: critical, then by points
  const order = { critical: 0, warning: 1, info: 2 };
  signals.sort(
    (a, b) => order[a.severity] - order[b.severity] || b.points - a.points,
  );

  const score = Math.min(
    RISK_RULES.maxScore,
    signals.reduce((sum, s) => sum + s.points, 0),
  );

  return {
    orgNumber: input.orgNumber,
    name: input.name,
    level: riskLevel(
      score,
      signals.some((s) => s.severity === "critical"),
    ),
    score,
    signals,
    limitations,
    assessedAt: now.toISOString(),
    disclaimer: RISK_DISCLAIMER,
  };
}

import type { ChangeSeverity } from "../models/CompanyChange.js";
import type { AccountsType, AnnualAccounts } from "../types/annualAccounts.js";

export interface AccountsChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  severity: ChangeSeverity;
}

export interface AccountsComparison {
  // Accounts for periods not stored yet, and corrected filings of stored periods
  toSave: AnnualAccounts[];
  changes: AccountsChange[];
}

// The same company, type and period is the same set of accounts,
// even when a corrected filing gives it a new Brreg id
function accountsKey(accounts: {
  type: AccountsType;
  periodEnd: string;
}): string {
  return `${accounts.type}|${accounts.periodEnd}`;
}

// The filings of one period, e.g. the company's and the group's 2025 accounts
function byPeriod(list: AnnualAccounts[]): Map<string, AnnualAccounts[]> {
  const periods = new Map<string, AnnualAccounts[]>();
  for (const accounts of list) {
    periods.set(accounts.periodEnd, [
      ...(periods.get(accounts.periodEnd) ?? []),
      accounts,
    ]);
  }
  return periods;
}

function filingValue(list: AnnualAccounts[]) {
  const first = list[0]!;
  return {
    year: first.year,
    periodEnd: first.periodEnd,
    // The company's own accounts first, then the group's
    types: list.map((accounts) => accounts.type).sort(),
  };
}

// Warning signs in a newly filed set of the company's own accounts,
// compared with the accounts of the period before it (undefined when unknown).
// Only a change for the worse is reported, not a state that was already known:
// a small company that has never been audited is not a new warning every year.
function warningSigns(
  current: AnnualAccounts,
  previous: AnnualAccounts | undefined,
): AccountsChange[] {
  const changes: AccountsChange[] = [];
  const { year, currency } = current;

  if (current.liquidation && !previous?.liquidation) {
    changes.push({
      field: "annualAccounts.liquidation",
      oldValue: null,
      newValue: { year },
      severity: "critical",
    });
  }

  const equity = current.figures.equity;
  const previousEquity = previous?.figures.equity ?? null;
  if (
    equity !== null &&
    equity < 0 &&
    (previousEquity === null || previousEquity >= 0)
  ) {
    changes.push({
      field: "annualAccounts.negativeEquity",
      oldValue:
        previous && previousEquity !== null
          ? {
              year: previous.year,
              equity: previousEquity,
              currency: previous.currency,
            }
          : null,
      newValue: { year, equity, currency },
      severity: "warning",
    });
  }

  if (previous?.audited && !current.audited) {
    changes.push({
      field: "annualAccounts.auditDropped",
      oldValue: { year: previous.year, audited: true },
      newValue: { year, audited: false },
      severity: "warning",
    });
  }

  return changes;
}

// Compares the stored accounts of a company with the accounts Brreg has now.
// previous is null when the accounts were never checked: everything is stored
// as the starting point and nothing is reported.
// Accounts that Brreg no longer lists are kept, so they are not compared.
export function compareAccounts(
  previous: AnnualAccounts[] | null,
  current: AnnualAccounts[],
): AccountsComparison {
  if (previous === null) {
    return { toSave: current, changes: [] };
  }

  const stored = new Map(
    previous.map((accounts) => [accountsKey(accounts), accounts]),
  );
  const filed = current.filter(
    (accounts) => !stored.has(accountsKey(accounts)),
  );
  const corrected = current.filter((accounts) => {
    const known = stored.get(accountsKey(accounts));
    return known !== undefined && known.brregId !== accounts.brregId;
  });

  const changes: AccountsChange[] = [];

  // Oldest period first, so a company that files two years at once
  // is compared year by year
  const filedPeriods = [...byPeriod(filed).entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  // The company's own accounts, stored and new, oldest first
  const companyAccounts = [
    ...previous.filter((accounts) => accounts.type === "company"),
    ...filed.filter((accounts) => accounts.type === "company"),
  ].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  for (const [periodEnd, list] of filedPeriods) {
    changes.push({
      field: "annualAccounts.filed",
      oldValue: null,
      newValue: filingValue(list),
      severity: "info",
    });

    const own = list.find((accounts) => accounts.type === "company");
    if (own) {
      const before = companyAccounts
        .filter((accounts) => accounts.periodEnd < periodEnd)
        .at(-1);
      changes.push(...warningSigns(own, before));
    }
  }

  const correctedPeriods = [...byPeriod(corrected).entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (const [, list] of correctedPeriods) {
    changes.push({
      field: "annualAccounts.corrected",
      oldValue: null,
      newValue: filingValue(list),
      severity: "info",
    });
  }

  return { toSave: [...filed, ...corrected], changes };
}

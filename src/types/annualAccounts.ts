// The app's own shape for the key figures of one set of annual accounts,
// independent of the Register of Company Accounts API format.

// "company" = the company itself, "group" = the group it is the parent of
export type AccountsType = "company" | "group";

// Key figures, in the currency the accounts were reported in.
// null when Brreg does not give the figure.
export interface AnnualAccountsFigures {
  // Income statement
  revenue: number | null;
  operatingExpenses: number | null;
  operatingProfit: number | null;
  netFinancialItems: number | null;
  profitBeforeTax: number | null;
  taxExpense: number | null;
  netProfit: number | null;

  // Balance sheet
  totalAssets: number | null;
  fixedAssets: number | null;
  currentAssets: number | null;
  cash: number | null;
  equity: number | null;
  totalDebt: number | null;
  shortTermDebt: number | null;
  longTermDebt: number | null;
}

export interface AnnualAccounts {
  // Brreg's id for this set of accounts; used to tell new accounts from known ones
  brregId: number;
  // The year the accounting period ends in
  year: number;
  periodStart: string;
  periodEnd: string;
  type: AccountsType;
  currency: string | null;
  accountingRules: string | null; // e.g. "NGAAP", "IFRS"

  // Warning signs
  audited: boolean;
  auditOptedOut: boolean;
  liquidation: boolean;

  figures: AnnualAccountsFigures;
}

// Result of asking for a company's annual accounts.
// "unsupported": the API does not give figures for this kind of company
// (e.g. banks and insurance companies). This is permanent, not an error.
export interface AnnualAccountsResult {
  status: "available" | "unsupported";
  accounts: AnnualAccounts[];
}
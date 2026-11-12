// Company data as the API returns it

export interface CompanyAddress {
  postalCode: string | null;
  city: string | null;
  municipality: string | null;
  municipalityNumber: string | null;
}

export interface Company {
  orgNumber: string;
  name: string;
  organizationForm: string;
  website: string | null;
  address: CompanyAddress | null;
  industryCode: string | null;
  industryDescription: string | null;
  employees: number | null;
  foundedDate: string | null;
  isBankrupt: boolean;
  isUnderLiquidation: boolean;
  isUnderForcedLiquidation: boolean;
  lastAnnualAccountsYear: number | null;
}

export interface CompanyRoles {
  ceo: string | null;
  boardChair: string | null;
  deputyChair: string | null;
  boardMembers: string[];
  deputyMembers: string[];
  auditor: string | null;
  accountant: string | null;
}

// A company on the user's watchlist (GET /api/watchlist/:orgNumber)
export interface WatchlistItem {
  orgNumber: string;
  name: string;
  note: string | null;
  followedSince: string;
  lastCheckedAt: string;
  lastChangedAt: string | null;
  deletedFromRegistryAt: string | null;
  company: Company;
  roles: CompanyRoles | null;
  risk: { level: RiskLevel | null; score: number | null };
}

export interface ChangeItem {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  severity: "info" | "warning" | "critical";
  detectedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export const MAX_NOTE_LENGTH = 500;

export type RiskLevel = "low" | "medium" | "high";

// One row of the watchlist (GET /api/watchlist)
export interface WatchlistRow extends WatchlistItem {
  accounts: {
    status: "available" | "unsupported" | null;
    latest: { year: number } | null;
  };
}

// Designsystemet colors for each risk level
export const RISK_COLOR = {
  low: "success",
  medium: "warning",
  high: "danger",
} as const satisfies Record<RiskLevel, string>;

// Annual accounts (GET .../accounts). Figures are in the currency the
// company reported in; null when Brreg does not give the figure.
export interface AnnualAccountsFigures {
  revenue: number | null;
  operatingExpenses: number | null;
  operatingProfit: number | null;
  netFinancialItems: number | null;
  profitBeforeTax: number | null;
  taxExpense: number | null;
  netProfit: number | null;
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
  year: number;
  periodStart: string;
  periodEnd: string;
  type: "company" | "group";
  currency: string | null;
  accountingRules: string | null;
  audited: boolean;
  auditOptedOut: boolean;
  liquidation: boolean;
  figures: AnnualAccountsFigures;
}

export interface AccountsResult {
  // null: a followed company whose accounts have not been checked yet
  status: "available" | "unsupported" | null;
  accounts: AnnualAccounts[];
}

// Risk report (GET .../risk). The client writes the texts from code and
// params; the API's English title/detail are not shown.
export type RiskParams = Record<string, string | number | null>;

export interface RiskSignal {
  code: string;
  severity: "critical" | "warning" | "info";
  points: number;
  params: RiskParams;
}

export interface RiskLimitation {
  code: string;
  params: RiskParams;
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  signals: RiskSignal[];
  limitations: RiskLimitation[];
  assessedAt: string;
}

// Types of the risk assessment: an explainable "check before you sign" report.
import type { Company } from "./company.js";
import type { AccountsStatus, AnnualAccounts } from "./annualAccounts.js";

export type RiskLevel = "low" | "medium" | "high";

// critical: decides the level on its own
// warning:  adds points to the score
// info:     worth knowing, no points
export type RiskSignalSeverity = "critical" | "warning" | "info";

export type RiskSignalCode =
  | "BANKRUPT"
  | "UNDER_LIQUIDATION"
  | "FORCED_LIQUIDATION"
  | "STRUCK_OFF"
  | "LIQUIDATION_ACCOUNTS"
  | "ACCOUNTS_OVERDUE"
  | "ACCOUNTS_MISSING_TWO_YEARS"
  | "NEGATIVE_EQUITY"
  | "LOW_EQUITY_RATIO"
  | "LOSS_TWO_YEARS"
  | "LOSS_LAST_YEAR"
  | "AUDITOR_LEFT"
  | "FREQUENT_CEO_CHANGES"
  | "FREQUENT_ADDRESS_CHANGES"
  | "YOUNG_COMPANY"
  | "AUDIT_OPTED_OUT";

// The values a signal or limitation is about (years, amounts, dates), so a
// client can write its own text in any language. title, detail and reason
// stay as ready-made English text, e.g. for the AI assistant.
export type RiskParams = Record<string, string | number | null>;

export interface RiskSignal {
  code: RiskSignalCode;
  severity: RiskSignalSeverity;
  points: number;
  title: string;
  detail: string;
  params: RiskParams;
}

// Something that could not be checked, or only partly,
// so a "low" level is never mistaken for a full check
export type RiskLimitationCode =
  | "ACCOUNTS_NOT_COVERED"
  | "ACCOUNTS_UNAVAILABLE"
  | "ACCOUNTS_DEADLINE_UNKNOWN"
  | "CHANGE_HISTORY_UNKNOWN"
  | "CHANGE_HISTORY_PARTIAL";

export interface RiskLimitation {
  code: RiskLimitationCode;
  reason: string;
  params: RiskParams;
}

export interface RiskAssessment {
  orgNumber: string;
  name: string | null;
  level: RiskLevel;
  score: number;
  signals: RiskSignal[];
  limitations: RiskLimitation[];
  assessedAt: string;
  disclaimer: string;
}

// A recorded change, as far as the risk rules need it
export interface RiskHistoryChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  detectedAt: Date;
}

// Everything the risk rules look at. Built from live Brreg data
// for any company, or from stored data for a followed company.
export interface RiskInput {
  orgNumber: string;
  name: string | null;
  // The company's data; for a struck-off company the last known data, if any
  company: Company | null;
  // Set when the company has been struck off the register
  struckOff: { date: string | null } | null;
  // "unknown": the accounts could not be fetched or were never checked
  accounts: { status: AccountsStatus | "unknown"; list: AnnualAccounts[] };
  // null when the company is not followed, so its changes are unknown
  history: { since: Date; changes: RiskHistoryChange[] } | null;
}

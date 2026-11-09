import type { Company } from "../types/company.js";
import type { ChangeSeverity } from "../models/CompanyChange.js";

// How important a change in each Company field is.
// null means the field is not tracked.
// Typed as Record<keyof Company, ...>, so adding a field to Company
// without deciding its severity here is a compile error.
export const FIELD_SEVERITY: Record<keyof Company, ChangeSeverity | null> = {
  // The organization number is the company's identity; it never changes
  orgNumber: null,
  name: "warning",
  organizationForm: "warning",
  website: "info",
  address: "warning",
  industryCode: "info",
  // Follows industryCode. Brreg also rewords descriptions when the industry
  // code list is revised, which would create alerts without a real change.
  industryDescription: null,
  employees: "info",
  foundedDate: "info",
  isBankrupt: "critical",
  isUnderLiquidation: "critical",
  isUnderForcedLiquidation: "critical",
  // A new year means new accounts were filed, which is good news.
  // Missing accounts are a risk signal, handled separately.
  lastAnnualAccountsYear: "info",
};

export interface FieldChange {
  field: keyof Company;
  oldValue: unknown;
  newValue: unknown;
  severity: ChangeSeverity;
}

// Compares two JSON values by content.
// Object key order is ignored, because PostgreSQL's JSONB does not keep it.
export function isEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => isEqualJson(item, b[index]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => key in bRecord && isEqualJson(aRecord[key], bRecord[key]));
}

// Lists the tracked fields that differ between the stored and the current company.
export function detectChanges(previous: Company, current: Company): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of Object.keys(FIELD_SEVERITY) as (keyof Company)[]) {
    const severity = FIELD_SEVERITY[field];
    if (severity === null) {
      continue;
    }

    const oldValue = previous[field];
    const newValue = current[field];

    // The stored snapshot is older than this field (it was added to Company later).
    // There is nothing to compare with yet, so this is not a change.
    if (oldValue === undefined) {
      continue;
    }

    if (!isEqualJson(oldValue, newValue)) {
      changes.push({ field, oldValue, newValue, severity });
    }
  }

  return changes;
}
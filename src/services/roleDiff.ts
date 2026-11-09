import type { CompanyRoles } from "../types/companyRoles.js";
import type { ChangeSeverity } from "../models/CompanyChange.js";
import { isEqualJson } from "./companyDiff.js";

// How important a change in each role is.
// Typed as Record<keyof CompanyRoles, ...>, so a new role field
// cannot be added without deciding its severity here.
export const ROLE_SEVERITY: Record<keyof CompanyRoles, ChangeSeverity> = {
  ceo: "warning",
  boardChair: "warning",
  deputyChair: "info",
  boardMembers: "info",
  deputyMembers: "info",
  // An auditor leaving is one of the early signs of financial trouble
  auditor: "warning",
  accountant: "info",
};

export interface RoleChange {
  // Stored as "roles.<field>", e.g. "roles.ceo"
  field: `roles.${keyof CompanyRoles}`;
  oldValue: unknown;
  newValue: unknown;
  severity: ChangeSeverity;
}

// Lists the roles that differ between the stored and the current roles.
// When no roles were stored yet, there is nothing to compare with,
// so the current roles are only stored and no changes are reported.
export function detectRoleChanges(
  previous: CompanyRoles | null,
  current: CompanyRoles,
): RoleChange[] {
  if (previous === null) {
    return [];
  }

  const changes: RoleChange[] = [];

  for (const field of Object.keys(ROLE_SEVERITY) as (keyof CompanyRoles)[]) {
    if (!isEqualJson(previous[field], current[field])) {
      changes.push({
        field: `roles.${field}`,
        oldValue: previous[field],
        newValue: current[field],
        severity: ROLE_SEVERITY[field],
      });
    }
  }

  return changes;
}

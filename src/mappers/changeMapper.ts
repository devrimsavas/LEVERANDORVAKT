import type { CompanyChange, ChangeSeverity } from "../models/CompanyChange.js";

// One detected change, as sent to clients.
export interface ChangeItem {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  severity: ChangeSeverity;
  detectedAt: Date;
}

export function toChangeItem(change: CompanyChange): ChangeItem {
  return {
    field: change.field,
    oldValue: change.oldValue,
    newValue: change.newValue,
    severity: change.severity,
    detectedAt: change.detectedAt,
  };
}

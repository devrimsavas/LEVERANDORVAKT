import type messages from "../../messages/en.json";

export type ChangeTitleKey = keyof (typeof messages)["changes"];

// Turns a stored change (field + new value) into a translation key under
// "changes", e.g. "roles.ceo" -> "roles_ceo". Translation keys cannot
// contain dots, and yes/no fields get a separate text for each direction.
const YES_NO_FIELDS = new Set([
  "isBankrupt",
  "isUnderLiquidation",
  "isUnderForcedLiquidation",
  "deletedFromRegistry",
]);

export function changeTitleKey(
  field: string,
  newValue: unknown,
): ChangeTitleKey {
  const key = field.replace(/\./g, "_");
  if (YES_NO_FIELDS.has(field)) {
    return `${key}_${newValue ? "yes" : "no"}` as ChangeTitleKey;
  }
  // A field the API added later than this app shows a general text, see
  // the "other" key, through t.has() in the caller
  return key as ChangeTitleKey;
}

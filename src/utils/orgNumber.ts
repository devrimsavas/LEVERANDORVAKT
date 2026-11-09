// Norwegian organization numbers are exactly 9 digits
const ORG_NUMBER_PATTERN = /^\d{9}$/;

export function isValidOrgNumber(value: unknown): value is string {
  return typeof value === "string" && ORG_NUMBER_PATTERN.test(value);
}

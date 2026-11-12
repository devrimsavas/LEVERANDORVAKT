// Norwegian organization numbers have 9 digits. People often write them
// with spaces ("912 345 678"), so spaces are removed before checking.
export function parseOrgNumber(value: string): string | null {
  const digits = value.replace(/\s/g, "");
  return /^\d{9}$/.test(digits) ? digits : null;
}

// "912345678" -> "912 345 678", the usual way to show them
export function formatOrgNumber(orgNumber: string): string {
  return orgNumber.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
}

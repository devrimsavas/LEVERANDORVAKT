import type { CompanyAddress } from "./companyTypes";

// Turns a stored old or new value into short text for the changes table.
// Values are names, numbers, dates, lists of names or an address.
export function formatChangeValue(
  value: unknown,
  yes: string,
  no: string,
): string {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "boolean") return value ? yes : no;
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "–";
  if (typeof value === "object") {
    const address = value as Partial<CompanyAddress> & { year?: number };
    if ("postalCode" in address || "city" in address) {
      return (
        [address.postalCode, address.city].filter(Boolean).join(" ") || "–"
      );
    }
    if (typeof address.year === "number") return String(address.year);
    return "–";
  }
  return String(value);
}

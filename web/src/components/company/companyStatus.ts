import type { Company } from "@/lib/companyTypes";

// The status tags shown next to a company name, worst first
export type CompanyStatus =
  | "struckOff"
  | "bankrupt"
  | "forcedLiquidation"
  | "liquidation";

export function companyStatuses(
  company: Company,
  struckOff: boolean,
): CompanyStatus[] {
  const statuses: CompanyStatus[] = [];
  if (struckOff) statuses.push("struckOff");
  if (company.isBankrupt) statuses.push("bankrupt");
  if (company.isUnderForcedLiquidation) statuses.push("forcedLiquidation");
  if (company.isUnderLiquidation) statuses.push("liquidation");
  return statuses;
}

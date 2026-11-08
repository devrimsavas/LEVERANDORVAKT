// The app's own company shape, independent of the Brreg API format.

export interface CompanyAddress {
  postalCode: string | null;
  city: string | null;
  municipality: string | null;
  municipalityNumber: string | null;
}

export interface Company {
  // Identity
  orgNumber: string;
  name: string;
  organizationForm: string; // e.g. "AS", "ASA", "ENK"
  website: string | null;

  // Location
  address: CompanyAddress | null;

  // Industry
  industryCode: string | null;
  industryDescription: string | null;

  // Size and age
  employees: number | null;
  foundedDate: string | null;

  // Risk flags
  isBankrupt: boolean;
  isUnderLiquidation: boolean;
  isUnderForcedLiquidation: boolean;
  lastAnnualAccountsYear: number | null;
}
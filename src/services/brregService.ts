import type { BrregEnhet, BrregSearchResponse } from "../types/brreg.js";
import type { Company } from "../types/company.js";
import { toCompany } from "../mappers/companyMapper.js";

const BRREG_BASE_URL = "https://data.brreg.no/enhetsregisteret/api";

// Fetches a single company by organization number.
// Returns null if the company does not exist.
export async function getCompany(orgNumber: string): Promise<Company | null> {
  const response = await fetch(`${BRREG_BASE_URL}/enheter/${orgNumber}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Brreg API error: ${response.status} ${response.statusText}`,
    );
  }

  const enhet = (await response.json()) as BrregEnhet;
  return toCompany(enhet);
}
// Searches companies by name. Returns an empty array if nothing matches.
export async function searchCompanies(
  name: string,
  limit = 20,
): Promise<Company[]> {
  const url = new URL(`${BRREG_BASE_URL}/enheter`);
  url.searchParams.set("navn", name);
  url.searchParams.set("size", String(limit));

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Brreg API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as BrregSearchResponse;
  const enheter = data._embedded?.enheter ?? [];

  return enheter.map(toCompany);
}

import type {
  BrregEnhet,
  BrregEnhetResponse,
  BrregSearchResponse,
  BrregUpdate,
  BrregUpdatesResponse,
} from "../types/brreg.js";
import type { Company } from "../types/company.js";
import { toCompany } from "../mappers/companyMapper.js";

const BRREG_BASE_URL = "https://data.brreg.no/enhetsregisteret/api";

// Result of looking up one company in the register.
export type CompanyLookup =
  | { status: "active"; company: Company }
  // Struck off the register. deletedDate is null when Brreg does not give one.
  | { status: "deleted"; deletedDate: string | null }
  | { status: "notFound" };

function brregError(response: Response): Error {
  return new Error(
    `Brreg API error: ${response.status} ${response.statusText}`,
  );
}

// Looks up a company and tells whether it is active, struck off or unknown.
export async function lookupCompany(orgNumber: string): Promise<CompanyLookup> {
  const response = await fetch(`${BRREG_BASE_URL}/enheter/${orgNumber}`);

  if (response.status === 404) {
    return { status: "notFound" };
  }

  // 410 Gone: removed from Brreg's open data
  if (response.status === 410) {
    return { status: "deleted", deletedDate: null };
  }

  if (!response.ok) {
    throw brregError(response);
  }

  const data = (await response.json()) as BrregEnhetResponse;

  if (data.respons_klasse === "SlettetEnhet") {
    return {
      status: "deleted",
      deletedDate: "slettedato" in data ? data.slettedato : null,
    };
  }

  return { status: "active", company: toCompany(data as BrregEnhet) };
}

// Fetches a single active company by organization number.
// Returns null if the company does not exist or has been struck off.
export async function getCompany(orgNumber: string): Promise<Company | null> {
  const result = await lookupCompany(orgNumber);
  return result.status === "active" ? result.company : null;
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
    throw brregError(response);
  }

  const data = (await response.json()) as BrregSearchResponse;
  const enheter = data._embedded?.enheter ?? [];

  return enheter.map(toCompany);
}

// Returns the id of the newest entry in the update feed.
export async function getLatestUpdateId(): Promise<number> {
  const url = new URL(`${BRREG_BASE_URL}/oppdateringer/enheter`);
  url.searchParams.set("sort", "id,DESC");
  url.searchParams.set("size", "1");

  const response = await fetch(url);

  if (!response.ok) {
    throw brregError(response);
  }

  const data = (await response.json()) as BrregUpdatesResponse;
  const latest = data._embedded?.oppdaterteEnheter[0];

  if (!latest) {
    throw new Error("Brreg update feed is empty");
  }

  return latest.oppdateringsid;
}

// Returns updates for the given companies from (and including) fromUpdateId,
// oldest first. At most `limit` updates are returned per call.
export async function getUpdatesSince(
  fromUpdateId: number,
  orgNumbers: string[],
  limit = 1000,
): Promise<BrregUpdate[]> {
  const url = new URL(`${BRREG_BASE_URL}/oppdateringer/enheter`);
  url.searchParams.set("oppdateringsid", String(fromUpdateId));
  url.searchParams.set("organisasjonsnummer", orgNumbers.join(","));
  url.searchParams.set("sort", "id,ASC");
  url.searchParams.set("size", String(limit));

  const response = await fetch(url);

  if (!response.ok) {
    throw brregError(response);
  }

  const data = (await response.json()) as BrregUpdatesResponse;
  return data._embedded?.oppdaterteEnheter ?? [];
}

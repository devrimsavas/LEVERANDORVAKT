import type {
  BrregEnhet,
  BrregEnhetResponse,
  BrregRoleEvent,
  BrregRollerResponse,
  BrregSearchResponse,
  BrregUpdate,
  BrregUpdatesResponse,
} from "../types/brreg.js";
import type { Company } from "../types/company.js";
import type { CompanyRoles } from "../types/companyRoles.js";
import { toCompany } from "../mappers/companyMapper.js";
import { toCompanyRoles } from "../mappers/companyRolesMapper.js";

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

// Fetches the current roles of a company.
// Returns null if the company does not exist or has been removed from the register.
export async function getCompanyRoles(
  orgNumber: string,
): Promise<CompanyRoles | null> {
  const response = await fetch(`${BRREG_BASE_URL}/enheter/${orgNumber}/roller`);

  if (response.status === 404 || response.status === 410) {
    return null;
  }

  if (!response.ok) {
    throw brregError(response);
  }

  const data = (await response.json()) as BrregRollerResponse;
  return toCompanyRoles(data);
}

// The role feed accepts at most this many events per request
const ROLE_EVENTS_MAX_PAGE = 10000;

async function fetchRoleEvents(
  params: Record<string, string>,
): Promise<BrregRoleEvent[]> {
  const url = new URL(`${BRREG_BASE_URL}/oppdateringer/roller`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw brregError(response);
  }

  const events = (await response.json()) as BrregRoleEvent[];
  // Ids are sent as text; sort numerically so the newest is always last
  return events.sort((a, b) => Number(a.id) - Number(b.id));
}

// Returns role events for the given companies after afterId, oldest first.
// At most `limit` events are returned per call.
export async function getRoleEventsAfter(
  afterId: number,
  orgNumbers: string[],
  limit = 1000,
): Promise<BrregRoleEvent[]> {
  return fetchRoleEvents({
    afterId: String(afterId),
    organisasjonsnummer: orgNumbers.join(","),
    size: String(limit),
  });
}

// Returns the id of the newest event in the role feed.
// The feed cannot be sorted newest first, so it looks back from now,
// widening the window until it finds events, then reads forward to the end.
export async function getLatestRoleEventId(): Promise<number> {
  const windowsInMinutes = [10, 60, 24 * 60, 7 * 24 * 60];

  for (const minutes of windowsInMinutes) {
    const afterTime = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    let events = await fetchRoleEvents({
      afterTime,
      size: String(ROLE_EVENTS_MAX_PAGE),
    });
    let latest = events.at(-1);

    // A full page means there may be more events after it
    while (latest && events.length === ROLE_EVENTS_MAX_PAGE) {
      events = await fetchRoleEvents({
        afterId: latest.id,
        size: String(ROLE_EVENTS_MAX_PAGE),
      });
      latest = events.at(-1) ?? latest;
    }

    if (latest) {
      return Number(latest.id);
    }
  }

  throw new Error("Brreg role feed has no events in the last 7 days");
}

import "server-only";
import { apiFetch } from "./api";
import type {
  ChangeItem,
  Company,
  CompanyRoles,
  Paginated,
  WatchlistItem,
  WatchlistRow,
} from "./companyTypes";

export type Loaded<T> =
  | { status: "ok"; data: T }
  | { status: "notFound" }
  | { status: "unavailable" };

export async function searchCompanies(
  name: string,
): Promise<Loaded<Company[]>> {
  const result = await apiFetch<Company[]>(
    `/api/companies/search?name=${encodeURIComponent(name)}`,
  );
  return result.ok
    ? { status: "ok", data: result.data }
    : { status: "unavailable" };
}

export interface CompanyPage {
  company: Company;
  roles: CompanyRoles | null;
  // Set when the user follows the company
  watch: WatchlistItem | null;
}

// A followed company is shown from stored data, which also works after it
// has been struck off. Any other company is looked up live in Brreg.
export async function getCompanyPage(
  orgNumber: string,
): Promise<Loaded<CompanyPage>> {
  const watched = await apiFetch<WatchlistItem>(`/api/watchlist/${orgNumber}`);
  if (watched.ok) {
    const roles = watched.data.roles ?? (await getLiveRoles(orgNumber));
    return {
      status: "ok",
      data: { company: watched.data.company, roles, watch: watched.data },
    };
  }

  const [company, roles] = await Promise.all([
    apiFetch<Company>(`/api/companies/${orgNumber}`),
    getLiveRoles(orgNumber),
  ]);
  if (company.ok) {
    return {
      status: "ok",
      data: { company: company.data, roles, watch: null },
    };
  }
  return company.status === 404 || company.status === 400
    ? { status: "notFound" }
    : { status: "unavailable" };
}

async function getLiveRoles(orgNumber: string): Promise<CompanyRoles | null> {
  const result = await apiFetch<CompanyRoles>(
    `/api/companies/${orgNumber}/roles`,
  );
  return result.ok ? result.data : null;
}

export const CHANGES_PAGE_SIZE = 20;

export async function getCompanyChanges(
  orgNumber: string,
  page: number,
): Promise<Loaded<Paginated<ChangeItem>>> {
  const result = await apiFetch<Paginated<ChangeItem>>(
    `/api/watchlist/${orgNumber}/changes?page=${page}&pageSize=${CHANGES_PAGE_SIZE}`,
  );
  if (result.ok) return { status: "ok", data: result.data };
  return result.status === 404
    ? { status: "notFound" }
    : { status: "unavailable" };
}

export type WatchlistSort = "name" | "risk";

export async function getWatchlist(
  sort: WatchlistSort,
): Promise<Loaded<WatchlistRow[]>> {
  const result = await apiFetch<WatchlistRow[]>(`/api/watchlist?sort=${sort}`);
  return result.ok
    ? { status: "ok", data: result.data }
    : { status: "unavailable" };
}

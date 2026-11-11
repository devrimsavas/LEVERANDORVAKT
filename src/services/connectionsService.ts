import { getRoleHolders, lookupCompany } from "./brregService.js";
import { CompanyNotFoundError, getWatchlist } from "./watchlistService.js";
import { mapWithLimit } from "../utils/concurrency.js";
import type {
  Connection,
  ConnectionLimitation,
  ConnectionsResult,
  RoleHolder,
} from "../types/connections.js";

// At most this many companies are compared per request
export const MAX_COMPANIES = 50;
// Brreg requests running at the same time
const CONCURRENT_REQUESTS = 5;

interface CompanyToCheck {
  orgNumber: string;
  name: string;
}

// Finds people and organizations that hold roles in two or more of the
// companies on the user's watchlist. With a candidate company, only the
// connections between the candidate and the watchlist are returned:
// "do the people behind this new supplier also run my current ones?"
//
// The roles are fetched live and matched in memory on name and birth date
// (people) or organization number (organizations). Birth dates are never
// stored or returned.
export async function findConnections(
  userPublicId: string,
  candidateOrgNumber: string | null,
): Promise<ConnectionsResult> {
  const limitations: ConnectionLimitation[] = [];
  const watchlist = await getWatchlist(userPublicId);

  let companies: CompanyToCheck[] = watchlist.map((item) => ({
    orgNumber: item.orgNumber,
    name: item.name,
  }));

  if (
    candidateOrgNumber &&
    !companies.some((c) => c.orgNumber === candidateOrgNumber)
  ) {
    const lookup = await lookupCompany(candidateOrgNumber);
    if (lookup.status === "notFound") {
      throw new CompanyNotFoundError("Company not found");
    }
    companies.unshift({
      orgNumber: candidateOrgNumber,
      name:
        lookup.status === "active" ? lookup.company.name : candidateOrgNumber,
    });
  }

  if (companies.length > MAX_COMPANIES) {
    limitations.push({
      code: "TOO_MANY_COMPANIES",
      reason: `Only the first ${MAX_COMPANIES} of ${companies.length} companies were compared.`,
    });
    companies = companies.slice(0, MAX_COMPANIES);
  }

  const holdersPerCompany = await mapWithLimit(
    companies,
    CONCURRENT_REQUESTS,
    async (company) => {
      try {
        return (await getRoleHolders(company.orgNumber)) ?? [];
      } catch (error) {
        console.error(
          `Connections: could not fetch roles of ${company.orgNumber}`,
          error,
        );
        limitations.push({
          code: "ROLES_UNAVAILABLE",
          reason: `The roles of ${company.name} (${company.orgNumber}) could not be fetched.`,
        });
        return [] as RoleHolder[];
      }
    },
  );

  // Group every role by the person or organization holding it
  const byHolder = new Map<
    string,
    { holder: RoleHolder; roles: Connection["roles"] }
  >();
  let unmatchedPersons = 0;

  companies.forEach((company, i) => {
    for (const holder of holdersPerCompany[i]!) {
      if (!holder.matchKey) {
        unmatchedPersons += 1;
        continue;
      }
      const group = byHolder.get(holder.matchKey) ?? { holder, roles: [] };
      group.roles.push({
        orgNumber: company.orgNumber,
        company: company.name,
        role: holder.role,
      });
      byHolder.set(holder.matchKey, group);
    }
  });

  if (unmatchedPersons > 0) {
    limitations.push({
      code: "PERSONS_WITHOUT_BIRTH_DATE",
      reason: `${unmatchedPersons} role holder(s) have no birth date in the register and were not matched, so that different people with the same name are not mixed up.`,
    });
  }

  const connections: Connection[] = [...byHolder.values()]
    // Two or more different companies
    .filter(({ roles }) => new Set(roles.map((r) => r.orgNumber)).size >= 2)
    .filter(
      ({ roles }) =>
        !candidateOrgNumber ||
        roles.some((r) => r.orgNumber === candidateOrgNumber),
    )
    .map(({ holder, roles }) => ({
      type: holder.type,
      name: holder.name,
      orgNumber: holder.orgNumber,
      roles,
    }))
    // Most connected first, then by name
    .sort(
      (a, b) =>
        new Set(b.roles.map((r) => r.orgNumber)).size -
          new Set(a.roles.map((r) => r.orgNumber)).size ||
        a.name.localeCompare(b.name, "nb"),
    );

  return { companiesChecked: companies.length, connections, limitations };
}

import type { BrregRolle, BrregRollerResponse } from "../types/brreg.js";
import type { CompanyRoles } from "../types/companyRoles.js";

// Brreg role type codes
const CEO = "DAGL";
const BOARD_CHAIR = "LEDE";
const DEPUTY_CHAIR = "NEST";
const BOARD_MEMBER = "MEDL";
const DEPUTY_MEMBER = "VARA";
const AUDITOR = "REVI";
const ACCOUNTANT = "REGN";

// Name of the person or entity holding a role
function holderName(role: BrregRolle): string | null {
  if (role.person) {
    const { fornavn, mellomnavn, etternavn } = role.person.navn;
    const name = [fornavn, mellomnavn, etternavn].filter(Boolean).join(" ");
    return name.length > 0 ? name : null;
  }
  if (role.enhet) {
    const name = role.enhet.navn.join(" ").trim();
    return name.length > 0 ? name : null;
  }
  return null;
}

// Names of the current holders of one role type, in Brreg's order
function holders(roles: BrregRolle[], code: string): string[] {
  return roles
    .filter((role) => role.type.kode === code)
    .sort((a, b) => (a.rekkefolge ?? 0) - (b.rekkefolge ?? 0))
    .map(holderName)
    .filter((name): name is string => name !== null);
}

// Converts Brreg's role groups into the app's CompanyRoles shape.
// Roles marked as deregistered or resigned are no longer held and are left out.
export function toCompanyRoles(response: BrregRollerResponse): CompanyRoles {
  const current = (response.rollegrupper ?? [])
    .flatMap((group) => group.roller)
    .filter((role) => !role.avregistrert && !role.fratraadt);

  const first = (code: string) => holders(current, code)[0] ?? null;
  const all = (code: string) =>
    holders(current, code).sort((a, b) => a.localeCompare(b, "nb"));

  return {
    ceo: first(CEO),
    boardChair: first(BOARD_CHAIR),
    deputyChair: first(DEPUTY_CHAIR),
    boardMembers: all(BOARD_MEMBER),
    deputyMembers: all(DEPUTY_MEMBER),
    auditor: first(AUDITOR),
    accountant: first(ACCOUNTANT),
  };
}

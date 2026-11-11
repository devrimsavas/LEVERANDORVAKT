import type { BrregRolle, BrregRollerResponse } from "../types/brreg.js";
import type { RoleHolder, RoleName } from "../types/connections.js";

// The Brreg role codes that count as connections, and their names
const ROLE_NAMES: Record<string, RoleName> = {
  DAGL: "ceo",
  LEDE: "boardChair",
  NEST: "deputyChair",
  MEDL: "boardMember",
  VARA: "deputyMember",
  REVI: "auditor",
  REGN: "accountant",
};

function normalize(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("nb");
}

function toRoleHolder(role: BrregRolle, roleName: RoleName): RoleHolder | null {
  if (role.person) {
    const { fornavn, mellomnavn, etternavn } = role.person.navn;
    const name = [fornavn, mellomnavn, etternavn].filter(Boolean).join(" ");
    if (!name) {
      return null;
    }
    // A name alone is not enough: two different people can share it.
    // Name and birth date together identify the person.
    const birthDate = role.person.fodselsdato;
    return {
      type: "person",
      name,
      orgNumber: null,
      role: roleName,
      matchKey: birthDate ? `person:${normalize(name)}|${birthDate}` : null,
    };
  }

  if (role.enhet) {
    const name = role.enhet.navn.join(" ").trim();
    return {
      type: "organization",
      name: name || role.enhet.organisasjonsnummer,
      orgNumber: role.enhet.organisasjonsnummer,
      role: roleName,
      // An organization number is unique
      matchKey: `organization:${role.enhet.organisasjonsnummer}`,
    };
  }

  return null;
}

// Lists who currently holds the roles of a company, for matching across
// companies. Roles marked as deregistered or resigned are left out.
export function toRoleHolders(response: BrregRollerResponse): RoleHolder[] {
  return (response.rollegrupper ?? [])
    .flatMap((group) => group.roller)
    .filter((role) => !role.avregistrert && !role.fratraadt)
    .flatMap((role) => {
      const roleName = ROLE_NAMES[role.type.kode];
      const holder = roleName ? toRoleHolder(role, roleName) : null;
      return holder ? [holder] : [];
    });
}

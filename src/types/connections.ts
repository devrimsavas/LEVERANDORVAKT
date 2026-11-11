// Connections between companies through the people and organizations
// that hold roles in them (CEO, board, auditor, ...).

export type RoleName =
  | "ceo"
  | "boardChair"
  | "deputyChair"
  | "boardMember"
  | "deputyMember"
  | "auditor"
  | "accountant";

// One role in one company, as used for matching. Only kept in memory:
// matchKey contains the person's birth date and is never stored or returned.
export interface RoleHolder {
  type: "person" | "organization";
  name: string;
  // Organizations only
  orgNumber: string | null;
  role: RoleName;
  // Same key = same person or organization; null when it cannot be told
  // apart safely (a person without a birth date)
  matchKey: string | null;
}

export interface ConnectionRole {
  orgNumber: string;
  company: string;
  role: RoleName;
}

// A person or organization holding roles in two or more of the companies
export interface Connection {
  type: "person" | "organization";
  name: string;
  orgNumber: string | null;
  roles: ConnectionRole[];
}

export type ConnectionLimitationCode =
  | "TOO_MANY_COMPANIES"
  | "ROLES_UNAVAILABLE"
  | "PERSONS_WITHOUT_BIRTH_DATE";

export interface ConnectionLimitation {
  code: ConnectionLimitationCode;
  reason: string;
}

export interface ConnectionsResult {
  companiesChecked: number;
  connections: Connection[];
  limitations: ConnectionLimitation[];
}

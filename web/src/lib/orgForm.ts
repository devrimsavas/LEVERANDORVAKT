import type messages from "../../messages/en.json";

type OrgFormCode = keyof (typeof messages)["orgForms"];

interface OrgFormTranslator {
  has(key: OrgFormCode): boolean;
  (key: OrgFormCode): string;
}

// The name of an organization form ("AS" -> "Private limited company").
// Brreg has more forms than the app names; unknown ones show their code.
export function orgFormName(t: OrgFormTranslator, code: string): string | null {
  return t.has(code as OrgFormCode) ? t(code as OrgFormCode) : null;
}

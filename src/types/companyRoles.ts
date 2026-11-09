// The app's own shape for the people and firms holding key roles in a company.
// Only names are stored; birth dates from the register are left out on purpose.

export interface CompanyRoles {
  ceo: string | null;
  boardChair: string | null;
  deputyChair: string | null;
  // Sorted by name, so a change in Brreg's ordering is not seen as a change
  boardMembers: string[];
  deputyMembers: string[];
  auditor: string | null;
  accountant: string | null;
}

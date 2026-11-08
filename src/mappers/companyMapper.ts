//companyMapper.ts
import type { BrregEnhet } from "../types/brreg.js";
import type { Company } from "../types/company.js";

// Converts a raw Brreg entity into the app's own Company shape.
export function toCompany(enhet: BrregEnhet): Company {
  const address = enhet.forretningsadresse;

  return {
    orgNumber: enhet.organisasjonsnummer,
    name: enhet.navn,
    organizationForm: enhet.organisasjonsform.kode,
    website: enhet.hjemmeside ?? null,

    address: address
      ? {
          postalCode: address.postnummer ?? null,
          city: address.poststed ?? null,
          municipality: address.kommune ?? null,
          municipalityNumber: address.kommunenummer ?? null,
        }
      : null,

    industryCode: enhet.naeringskode1?.kode ?? null,
    industryDescription: enhet.naeringskode1?.beskrivelse ?? null,

    employees: enhet.antallAnsatte ?? null,
    foundedDate: enhet.stiftelsesdato ?? null,

    isBankrupt: enhet.konkurs,
    isUnderLiquidation: enhet.underAvvikling,
    isUnderForcedLiquidation: enhet.underTvangsavviklingEllerTvangsopplosning,
    lastAnnualAccountsYear: enhet.sisteInnsendteAarsregnskap
      ? Number(enhet.sisteInnsendteAarsregnskap)
      : null,
  };
}

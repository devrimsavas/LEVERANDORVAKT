//BrregEnhet.ts
// Shapes of the data returned by the Brønnøysund Register Centre API.
// Only the fields this app uses are listed; the API returns more.

export interface BrregKode {
  kode: string;
  beskrivelse: string;
}

export interface BrregAdresse {
  adresse?: string[];
  postnummer?: string;
  poststed?: string;
  kommune?: string;
  kommunenummer?: string;
  land?: string;
  landkode?: string;
}

export interface BrregEnhet {
  // Identity
  organisasjonsnummer: string;
  navn: string;
  organisasjonsform: BrregKode;
  hjemmeside?: string;

  // Location
  forretningsadresse?: BrregAdresse;

  // Industry
  naeringskode1?: BrregKode;

  // Size and age
  antallAnsatte?: number;
  stiftelsesdato?: string;

  // Risk flags
  konkurs: boolean;
  underAvvikling: boolean;
  underTvangsavviklingEllerTvangsopplosning: boolean;
  sisteInnsendteAarsregnskap?: string;
}

//in case no result
export interface BrregSearchResponse {
  _embedded?: {
    enheter: BrregEnhet[];
  };
  page: {
    size: number;
    totalElements: number;
    totalPages: number;
    number: number;
  };
}

// A company that has been struck off the register.
// Brreg answers with 200 OK but only a few fields, and the risk flags are missing.
export interface BrregSlettetEnhet {
  organisasjonsnummer: string;
  navn: string;
  respons_klasse: "SlettetEnhet";
  slettedato: string;
}

// Response of GET /enheter/{orgNumber}: an active or a struck-off company.
export type BrregEnhetResponse =
  | (BrregEnhet & { respons_klasse?: string })
  | BrregSlettetEnhet;

// One entry in the update feed (GET /oppdateringer/enheter).
export interface BrregUpdate {
  oppdateringsid: number;
  dato: string;
  organisasjonsnummer: string;
  endringstype: "Ukjent" | "Ny" | "Endring" | "Sletting" | "Fjernet";
}

export interface BrregUpdatesResponse {
  _embedded?: {
    oppdaterteEnheter: BrregUpdate[];
  };
  page: {
    size: number;
    totalElements: number;
    totalPages: number;
    number: number;
  };
}

// Roles of a company (GET /enheter/{orgNumber}/roller).
// A role is held either by a person or by another entity (e.g. an audit firm).
export interface BrregRollePerson {
  fodselsdato?: string;
  erDoed?: boolean;
  navn: {
    fornavn?: string;
    mellomnavn?: string;
    etternavn?: string;
  };
}

export interface BrregRolleEnhet {
  organisasjonsnummer: string;
  navn: string[];
  erSlettet?: boolean;
}

export interface BrregRolle {
  type: BrregKode;
  person?: BrregRollePerson;
  enhet?: BrregRolleEnhet;
  // The role is still listed but no longer held
  avregistrert?: boolean;
  fratraadt?: boolean;
  rekkefolge?: number;
}

export interface BrregRollegruppe {
  type: BrregKode;
  sistEndret?: string;
  roller: BrregRolle[];
}

export interface BrregRollerResponse {
  rollegrupper?: BrregRollegruppe[];
}

// One event in the role update feed (GET /oppdateringer/roller).
// It only says that the roles of a company changed, not what changed.
export interface BrregRoleEvent {
  id: string;
  time: string;
  type: string;
  data: {
    organisasjonsnummer: string;
  };
}

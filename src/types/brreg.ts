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

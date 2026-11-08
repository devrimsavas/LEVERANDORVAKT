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

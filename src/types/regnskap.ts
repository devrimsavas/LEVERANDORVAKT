// Shapes of the data returned by the Register of Company Accounts API
// (Regnskapsregisteret, GET /regnskapsregisteret/regnskap/{orgNumber}).
// Only the fields this app uses are listed; the API returns more.
// Field names are kept exactly as Brreg spells them, including its typos
// ("regnkapsprinsipper", "sumInnskuttEgenkaptial").
// Any figure can be missing, and some groups arrive as empty objects.

export interface BrregRegnskap {
  // Brreg's id for this set of accounts
  id: number;
  journalnr?: string;
  // "SELSKAP" = the company itself, "KONSERN" = the group it is the parent of
  regnskapstype: string;
  regnskapsperiode: {
    fraDato: string;
    tilDato: string;
  };
  // Companies may report in another currency than NOK
  valuta?: string;
  // Accounts drawn up because the company is being wound up
  avviklingsregnskap?: boolean;
  revisjon?: {
    ikkeRevidertAarsregnskap?: boolean;
    fravalgRevisjon?: boolean;
  };
  regnkapsprinsipper?: {
    smaaForetak?: boolean;
    regnskapsregler?: string;
  };
  egenkapitalGjeld?: {
    egenkapital?: {
      sumEgenkapital?: number;
    };
    gjeldOversikt?: {
      sumGjeld?: number;
      kortsiktigGjeld?: { sumKortsiktigGjeld?: number };
      langsiktigGjeld?: { sumLangsiktigGjeld?: number };
    };
  };
  eiendeler?: {
    sumBankinnskuddOgKontanter?: number;
    sumEiendeler?: number;
    omloepsmidler?: { sumOmloepsmidler?: number };
    anleggsmidler?: { sumAnleggsmidler?: number };
  };
  resultatregnskapResultat?: {
    ordinaertResultatFoerSkattekostnad?: number;
    ordinaertResultatSkattekostnad?: number;
    aarsresultat?: number;
    finansresultat?: {
      nettoFinans?: number;
    };
    driftsresultat?: {
      driftsresultat?: number;
      driftsinntekter?: { sumDriftsinntekter?: number };
      driftskostnad?: { sumDriftskostnad?: number };
    };
  };
}

// Error body the API sends with a 500 status
export interface BrregRegnskapError {
  status?: string;
  error?: string;
  message?: string;
}
import { afterEach, beforeEach, vi } from "vitest";
import type {
  BrregEnhet,
  BrregRoleEvent,
  BrregRolle,
  BrregRollerResponse,
  BrregUpdate,
} from "../../src/types/brreg.js";
import type { BrregRegnskap } from "../../src/types/regnskap.js";
import { latestDueAccountsYear } from "../../src/services/riskAssessment.js";

// What the fake register answers for one organization number
export type FakeCompany =
  | { kind: "active"; enhet: BrregEnhet }
  | { kind: "deleted"; slettedato: string }
  | { kind: "error"; status: number };

// An in-memory stand-in for the Brønnøysund API.
// Tests change its contents to simulate what happens in the real register.
// Answers requests to another service (e.g. a language model) that the
// tests route through the same fake fetch. Returns null to pass the request on.
export type ExtraHandler = (
  url: URL,
  init: RequestInit | undefined,
) => Promise<Response | null> | Response | null;

export interface FakeRegistration {
  // Registration date, e.g. "2026-03-14"
  date: string;
  municipality?: string;
  industry?: { kode: string; beskrivelse: string } | null;
  form?: string;
}

export interface FakeMunicipality {
  kommunenummer: string;
  kommunenavnNorsk: string;
}

export interface FakeBrreg {
  companies: Map<string, FakeCompany>;
  // Companies only used for registration searches (trends)
  registrations: BrregEnhet[];
  // Kartverket's municipality list; null makes Kartverket answer 503
  municipalities: FakeMunicipality[] | null;
  addRegistrations(count: number, registration: FakeRegistration): void;
  updates: BrregUpdate[];
  // Roles per company: the Brreg response, or an HTTP status to fail with
  roles: Map<string, BrregRollerResponse | { errorStatus: number }>;
  roleEvents: BrregRoleEvent[];
  // Annual accounts per company: the Brreg response, or an HTTP status
  // (and error message) to fail with
  accounts: Map<
    string,
    BrregRegnskap[] | { errorStatus: number; message: string }
  >;
  // Every URL the app requested, to check how often Brreg was called
  requests: URL[];
  // Milliseconds to wait before answering, to simulate a slow register
  delayMs: number;
  // Handlers for other services; cleared before every test
  extraHandlers: ExtraHandler[];
  setActive(enhet: BrregEnhet): void;
  setDeleted(orgNumber: string, slettedato: string): void;
  setError(orgNumber: string, status: number): void;
  addUpdate(
    orgNumber: string,
    endringstype?: BrregUpdate["endringstype"],
  ): number;
  setRoles(orgNumber: string, roles: BrregRollerResponse): void;
  setRolesError(orgNumber: string, status: number): void;
  addRoleEvent(orgNumber: string): number;
  setAccounts(orgNumber: string, accounts: BrregRegnskap[]): void;
  setAccountsError(orgNumber: string, status: number, message: string): void;
}

export interface FakeRoles {
  ceo?: string;
  boardChair?: string;
  boardMembers?: string[];
  deputyMembers?: string[];
  auditor?: string;
  // Board members who are still listed but marked as deregistered
  deregisteredMembers?: string[];
  // Birth date per person; 1970-01-01 when not given, null for none at all
  birthDates?: Record<string, string | null>;
  // Organization number of the audit firm
  auditorOrgNumber?: string;
}

function person(fullName: string, birthDates: FakeRoles["birthDates"] = {}) {
  const parts = fullName.split(" ");
  const birthDate =
    fullName in birthDates ? birthDates[fullName] : "1970-01-01";
  return {
    erDoed: false,
    ...(birthDate ? { fodselsdato: birthDate } : {}),
    navn: {
      fornavn: parts.slice(0, -1).join(" "),
      etternavn: parts.at(-1)!,
    },
  };
}

function role(
  code: string,
  holder: Partial<BrregRolle>,
  rekkefolge: number,
  avregistrert = false,
): BrregRolle {
  return {
    type: { kode: code, beskrivelse: code },
    avregistrert,
    rekkefolge,
    ...holder,
  };
}

// Builds a roles response with the same structure as the real register:
// groups for the CEO (DAGL), the board (STYR) and the auditor (REVI).
export function brregRoller(roles: FakeRoles): BrregRollerResponse {
  const groups: NonNullable<BrregRollerResponse["rollegrupper"]> = [];
  if (roles.ceo) {
    groups.push({
      type: { kode: "DAGL", beskrivelse: "Daglig leder" },
      roller: [
        role("DAGL", { person: person(roles.ceo, roles.birthDates) }, 0),
      ],
    });
  }
  const board = [
    ...(roles.boardChair
      ? [
          role(
            "LEDE",
            { person: person(roles.boardChair, roles.birthDates) },
            0,
          ),
        ]
      : []),
    ...(roles.boardMembers ?? []).map((name, i) =>
      role("MEDL", { person: person(name, roles.birthDates) }, i + 1),
    ),
    ...(roles.deregisteredMembers ?? []).map((name, i) =>
      role("MEDL", { person: person(name, roles.birthDates) }, i + 50, true),
    ),
    ...(roles.deputyMembers ?? []).map((name, i) =>
      role("VARA", { person: person(name, roles.birthDates) }, i + 100),
    ),
  ];
  if (board.length > 0) {
    groups.push({
      type: { kode: "STYR", beskrivelse: "Styre" },
      roller: board,
    });
  }
  if (roles.auditor) {
    groups.push({
      type: { kode: "REVI", beskrivelse: "Revisor" },
      roller: [
        role(
          "REVI",
          {
            enhet: {
              organisasjonsnummer: roles.auditorOrgNumber ?? "976389387",
              navn: [roles.auditor],
            },
          },
          0,
        ),
      ],
    });
  }
  return { rollegrupper: groups };
}

export interface FakeAccounts {
  // Brreg's id for the accounts; a corrected filing gets a new one
  id: number;
  year: number;
  type?: "company" | "group";
  equity?: number;
  audited?: boolean;
  auditOptedOut?: boolean;
  liquidation?: boolean;
}

// Builds one set of annual accounts with the same structure as the real
// accounts register, for a calendar year, in NOK.
export function brregRegnskap(accounts: FakeAccounts): BrregRegnskap {
  return {
    id: accounts.id,
    regnskapstype: accounts.type === "group" ? "KONSERN" : "SELSKAP",
    regnskapsperiode: {
      fraDato: `${accounts.year}-01-01`,
      tilDato: `${accounts.year}-12-31`,
    },
    valuta: "NOK",
    avviklingsregnskap: accounts.liquidation ?? false,
    revisjon: {
      ikkeRevidertAarsregnskap: !(accounts.audited ?? true),
      fravalgRevisjon: accounts.auditOptedOut ?? false,
    },
    regnkapsprinsipper: { smaaForetak: false, regnskapsregler: "NGAAP" },
    egenkapitalGjeld: {
      egenkapital: { sumEgenkapital: accounts.equity ?? 5000000 },
    },
    resultatregnskapResultat: { aarsresultat: 1000000 },
  };
}

// Builds a realistic active company. Fields can be overridden per test.
export function brregEnhet(
  orgNumber: string,
  name: string,
  overrides: Partial<BrregEnhet> = {},
): BrregEnhet {
  return {
    organisasjonsnummer: orgNumber,
    navn: name,
    organisasjonsform: { kode: "AS", beskrivelse: "Aksjeselskap" },
    forretningsadresse: {
      adresse: ["Storgata 1"],
      postnummer: "9510",
      poststed: "ALTA",
      kommune: "ALTA",
      kommunenummer: "5601",
      land: "Norge",
      landkode: "NO",
    },
    naeringskode1: { kode: "79.120", beskrivelse: "Reisearrangørvirksomhet" },
    antallAnsatte: 12,
    stiftelsesdato: "2015-03-01",
    konkurs: false,
    underAvvikling: false,
    underTvangsavviklingEllerTvangsopplosning: false,
    // Always up to date with its filing, whatever day the tests run on,
    // so no test gets an "accounts overdue" risk signal by accident
    sisteInnsendteAarsregnskap: String(latestDueAccountsYear(new Date())),
    ...overrides,
  };
}

function handle(fake: FakeBrreg, url: URL, headers: Headers): Response {
  const accountsMatch = url.pathname.match(
    /\/regnskapsregisteret\/regnskap\/(\d{9})$/,
  );
  if (accountsMatch) {
    // Like the real API, answer in XML unless JSON is asked for
    if (headers.get("accept") !== "application/json") {
      return new Response("<regnskap/>", {
        headers: { "content-type": "application/xml" },
      });
    }
    const accounts = fake.accounts.get(accountsMatch[1]!);
    // The real API answers 404 with an empty body when there are no accounts
    if (!accounts) {
      return new Response(null, { status: 404 });
    }
    if ("errorStatus" in accounts) {
      return Response.json(
        { status: String(accounts.errorStatus), message: accounts.message },
        { status: accounts.errorStatus, statusText: "Fake error" },
      );
    }
    return Response.json(accounts);
  }

  const rolesMatch = url.pathname.match(
    /\/enhetsregisteret\/api\/enheter\/(\d{9})\/roller$/,
  );
  if (rolesMatch) {
    const roles = fake.roles.get(rolesMatch[1]!);
    if (!roles) {
      return new Response("{}", { status: 404 });
    }
    if ("errorStatus" in roles) {
      return new Response("", {
        status: roles.errorStatus,
        statusText: "Fake error",
      });
    }
    return Response.json(roles);
  }

  if (url.pathname.endsWith("/enhetsregisteret/api/oppdateringer/roller")) {
    let list = [...fake.roleEvents];
    const afterId = url.searchParams.get("afterId");
    const afterTime = url.searchParams.get("afterTime");
    const orgNumbers = url.searchParams.get("organisasjonsnummer");
    if (afterId) {
      list = list.filter((e) => Number(e.id) > Number(afterId));
    }
    if (afterTime) {
      list = list.filter((e) => e.time > afterTime);
    }
    if (orgNumbers) {
      const wanted = new Set(orgNumbers.split(","));
      list = list.filter((e) => wanted.has(e.data.organisasjonsnummer));
    }
    list.sort((a, b) => Number(a.id) - Number(b.id));
    return Response.json(
      list.slice(0, Number(url.searchParams.get("size") ?? 100)),
    );
  }

  const companyMatch = url.pathname.match(
    /\/enhetsregisteret\/api\/enheter\/(\d{9})$/,
  );
  if (companyMatch) {
    const company = fake.companies.get(companyMatch[1]!);
    if (!company) {
      return new Response("{}", { status: 404 });
    }
    if (company.kind === "error") {
      return new Response("", {
        status: company.status,
        statusText: "Fake error",
      });
    }
    if (company.kind === "deleted") {
      return Response.json({
        organisasjonsnummer: companyMatch[1],
        navn: "STRUCK OFF COMPANY",
        organisasjonsform: { kode: "AS", beskrivelse: "Aksjeselskap" },
        respons_klasse: "SlettetEnhet",
        slettedato: company.slettedato,
      });
    }
    return Response.json({ ...company.enhet, respons_klasse: "Enhet" });
  }

  if (url.hostname === "ws.geonorge.no") {
    return fake.municipalities
      ? Response.json(fake.municipalities)
      : new Response(null, { status: 503, statusText: "Service Unavailable" });
  }

  // Company search: by name, or by registration date, municipality,
  // industry (a code or its start) and organization form, like Brreg
  if (url.pathname.endsWith("/enhetsregisteret/api/enheter")) {
    const params = url.searchParams;
    const name = (params.get("navn") ?? "").toLowerCase();
    const from = params.get("fraRegistreringsdatoEnhetsregisteret");
    const to = params.get("tilRegistreringsdatoEnhetsregisteret");
    const municipality = params.get("kommunenummer");
    const industry = params.get("naeringskode");
    const form = params.get("organisasjonsform");
    const size = Number(params.get("size") ?? 20);
    const page = Number(params.get("page") ?? 0);

    // Brreg only pages through the first 10,000 results
    if (size * (page + 1) > 10000) {
      return Response.json(
        { error: "Bad Request" },
        { status: 400, statusText: "Bad Request" },
      );
    }

    const activeCompanies = [...fake.companies.values()]
      .filter(
        (c): c is Extract<FakeCompany, { kind: "active" }> =>
          c.kind === "active",
      )
      .map((c) => c.enhet);
    const matches = [...activeCompanies, ...fake.registrations].filter(
      (e) =>
        e.navn.toLowerCase().includes(name) &&
        (!from || (e.registreringsdatoEnhetsregisteret ?? "") >= from) &&
        (!to || (e.registreringsdatoEnhetsregisteret ?? "9999") <= to) &&
        (!municipality ||
          e.forretningsadresse?.kommunenummer === municipality) &&
        (!industry || (e.naeringskode1?.kode ?? "").startsWith(industry)) &&
        (!form || e.organisasjonsform.kode === form),
    );
    const pageItems = matches.slice(page * size, (page + 1) * size);

    return Response.json({
      ...(pageItems.length > 0 ? { _embedded: { enheter: pageItems } } : {}),
      page: {
        size,
        totalElements: matches.length,
        totalPages: Math.ceil(matches.length / size),
        number: page,
      },
    });
  }

  if (url.pathname.endsWith("/enhetsregisteret/api/oppdateringer/enheter")) {
    let list = [...fake.updates];
    const from = url.searchParams.get("oppdateringsid");
    const orgNumbers = url.searchParams.get("organisasjonsnummer");
    if (from) {
      list = list.filter((u) => u.oppdateringsid >= Number(from));
    }
    if (orgNumbers) {
      const wanted = new Set(orgNumbers.split(","));
      list = list.filter((u) => wanted.has(u.organisasjonsnummer));
    }
    const descending =
      url.searchParams.get("sort")?.toUpperCase().endsWith("DESC") ?? false;
    list.sort((a, b) =>
      descending
        ? b.oppdateringsid - a.oppdateringsid
        : a.oppdateringsid - b.oppdateringsid,
    );
    list = list.slice(0, Number(url.searchParams.get("size") ?? 20));
    return Response.json({
      ...(list.length > 0 ? { _embedded: { oppdaterteEnheter: list } } : {}),
      page: {
        size: list.length,
        totalElements: list.length,
        totalPages: 1,
        number: 0,
      },
    });
  }

  return new Response("Not handled by fake Brreg", { status: 500 });
}

// Replaces fetch with the fake register for every test in the file.
// The company feed starts at update id 1000 and the role feed at event id 5000,
// as if the register already had a history.
export function useFakeBrreg(): FakeBrreg {
  // Events in both feeds get strictly increasing times, 1 ms apart,
  // so their order is always clear even within the same millisecond
  let clock = Date.now();
  const nextTime = () => new Date(++clock).toISOString();

  const fake: FakeBrreg = {
    companies: new Map(),
    updates: [],
    roles: new Map(),
    roleEvents: [],
    accounts: new Map(),
    requests: [],
    delayMs: 0,
    extraHandlers: [],
    registrations: [],
    municipalities: null,
    addRegistrations(count, registration) {
      for (let i = 0; i < count; i++) {
        const orgNumber = String(800000000 + fake.registrations.length);
        const enhet = brregEnhet(orgNumber, `REGISTERED ${orgNumber} AS`, {
          registreringsdatoEnhetsregisteret: registration.date,
          organisasjonsform: {
            kode: registration.form ?? "AS",
            beskrivelse: registration.form ?? "Aksjeselskap",
          },
        });
        enhet.forretningsadresse!.kommunenummer =
          registration.municipality ?? "5601";
        if (registration.industry === null) {
          delete enhet.naeringskode1;
        } else if (registration.industry) {
          enhet.naeringskode1 = registration.industry;
        }
        fake.registrations.push(enhet);
      }
    },

    setActive(enhet) {
      fake.companies.set(enhet.organisasjonsnummer, { kind: "active", enhet });
    },
    setDeleted(orgNumber, slettedato) {
      fake.companies.set(orgNumber, { kind: "deleted", slettedato });
    },
    setError(orgNumber, status) {
      fake.companies.set(orgNumber, { kind: "error", status });
    },
    setRoles(orgNumber, roles) {
      fake.roles.set(orgNumber, roles);
    },
    setRolesError(orgNumber, status) {
      fake.roles.set(orgNumber, { errorStatus: status });
    },
    setAccounts(orgNumber, accounts) {
      fake.accounts.set(orgNumber, accounts);
    },
    setAccountsError(orgNumber, status, message) {
      fake.accounts.set(orgNumber, { errorStatus: status, message });
    },
    addRoleEvent(orgNumber) {
      const last = Number(fake.roleEvents.at(-1)?.id ?? 4999);
      const id = last + 1;
      fake.roleEvents.push({
        id: String(id),
        time: nextTime(),
        type: "no.brreg.enhetsregisteret.rolle.oppdatert",
        data: { organisasjonsnummer: orgNumber },
      });
      return id;
    },
    addUpdate(orgNumber, endringstype = "Endring") {
      const last = fake.updates.at(-1)?.oppdateringsid ?? 999;
      const oppdateringsid = last + 1;
      fake.updates.push({
        oppdateringsid,
        dato: nextTime(),
        organisasjonsnummer: orgNumber,
        endringstype,
      });
      return oppdateringsid;
    },
  };

  beforeEach(() => {
    clock = Date.now();
    fake.companies.clear();
    fake.roles.clear();
    fake.accounts.clear();
    fake.roleEvents.length = 0;
    fake.addRoleEvent("000000000");
    fake.requests.length = 0;
    fake.updates.length = 0;
    fake.delayMs = 0;
    fake.extraHandlers.length = 0;
    fake.registrations.length = 0;
    fake.municipalities = [
      { kommunenummer: "0301", kommunenavnNorsk: "Oslo" },
      { kommunenummer: "5601", kommunenavnNorsk: "Alta" },
      { kommunenummer: "5501", kommunenavnNorsk: "Tromsø" },
    ];
    fake.addUpdate("000000000", "Ny");

    vi.stubGlobal(
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        const headers = new Headers(init?.headers);
        fake.requests.push(url);
        for (const extra of fake.extraHandlers) {
          const response = await extra(url, init);
          if (response) {
            return response;
          }
        }
        if (fake.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, fake.delayMs));
        }
        return handle(fake, url, headers);
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  return fake;
}

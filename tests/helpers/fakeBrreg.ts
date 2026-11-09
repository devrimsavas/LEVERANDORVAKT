import { afterEach, beforeEach, vi } from "vitest";
import type { BrregEnhet, BrregUpdate } from "../../src/types/brreg.js";

// What the fake register answers for one organization number
export type FakeCompany =
  | { kind: "active"; enhet: BrregEnhet }
  | { kind: "deleted"; slettedato: string }
  | { kind: "error"; status: number };

// An in-memory stand-in for the Brønnøysund API.
// Tests change its contents to simulate what happens in the real register.
export interface FakeBrreg {
  companies: Map<string, FakeCompany>;
  updates: BrregUpdate[];
  // Every URL the app requested, to check how often Brreg was called
  requests: URL[];
  // Milliseconds to wait before answering, to simulate a slow register
  delayMs: number;
  setActive(enhet: BrregEnhet): void;
  setDeleted(orgNumber: string, slettedato: string): void;
  setError(orgNumber: string, status: number): void;
  addUpdate(
    orgNumber: string,
    endringstype?: BrregUpdate["endringstype"],
  ): number;
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
    sisteInnsendteAarsregnskap: "2025",
    ...overrides,
  };
}

function handle(fake: FakeBrreg, url: URL): Response {
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

  if (url.pathname.endsWith("/enhetsregisteret/api/enheter")) {
    const name = (url.searchParams.get("navn") ?? "").toLowerCase();
    const matches = [...fake.companies.values()]
      .filter(
        (c): c is Extract<FakeCompany, { kind: "active" }> =>
          c.kind === "active",
      )
      .map((c) => c.enhet)
      .filter((e) => e.navn.toLowerCase().includes(name));
    return Response.json({
      ...(matches.length > 0 ? { _embedded: { enheter: matches } } : {}),
      page: {
        size: matches.length,
        totalElements: matches.length,
        totalPages: 1,
        number: 0,
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
// The feed starts at update id 1000, as if the register already had a history.
export function useFakeBrreg(): FakeBrreg {
  const fake: FakeBrreg = {
    companies: new Map(),
    updates: [],
    requests: [],
    delayMs: 0,

    setActive(enhet) {
      fake.companies.set(enhet.organisasjonsnummer, { kind: "active", enhet });
    },
    setDeleted(orgNumber, slettedato) {
      fake.companies.set(orgNumber, { kind: "deleted", slettedato });
    },
    setError(orgNumber, status) {
      fake.companies.set(orgNumber, { kind: "error", status });
    },
    addUpdate(orgNumber, endringstype = "Endring") {
      const last = fake.updates.at(-1)?.oppdateringsid ?? 999;
      const oppdateringsid = last + 1;
      fake.updates.push({
        oppdateringsid,
        dato: new Date().toISOString(),
        organisasjonsnummer: orgNumber,
        endringstype,
      });
      return oppdateringsid;
    },
  };

  beforeEach(() => {
    fake.companies.clear();
    fake.requests.length = 0;
    fake.updates.length = 0;
    fake.delayMs = 0;
    fake.addUpdate("000000000", "Ny");

    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      fake.requests.push(url);
      if (fake.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, fake.delayMs));
      }
      return handle(fake, url);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  return fake;
}

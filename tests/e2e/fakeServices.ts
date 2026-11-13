// Loaded before the API when the web app's end-to-end tests run
// (npm run e2e:api, started by web/playwright.config.ts). It:
//   1. creates a fresh, empty database for the run,
//   2. replaces fetch, so Brreg, Kartverket, SSB, the language model and
//      Resend (email) are answered by fakes and never by the network,
//   3. opens a small control server the tests use to make things happen in
//      the fake register, such as a company going bankrupt.
// Never used in production: the normal start command does not load it.
import "dotenv/config";
import http from "node:http";
import { Sequelize } from "sequelize";
import {
  brregEnhet,
  brregRegnskap,
  brregRoller,
  createFakeBrreg,
} from "../helpers/fakeRegister.js";
import { createFakeResend } from "../helpers/fakeResend.js";
import type { BrregRegnskap } from "../../src/types/regnskap.js";

// ---- 1. A fresh database ----

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
// The database is dropped on every run, so only one made for this is accepted
if (!/^[a-z0-9_]+_e2e$/.test(databaseName)) {
  throw new Error(
    `The end-to-end database name must end with "_e2e", got "${databaseName}"`,
  );
}
const serverUrl = new URL(databaseUrl);
serverUrl.pathname = "/postgres";
const server = new Sequelize(serverUrl.toString(), { logging: false });
await server.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
await server.query(`CREATE DATABASE "${databaseName}"`);
await server.close();

// ---- 2. Fake services ----

const { fake, reset, fetch: fakeFetch } = createFakeBrreg();
reset();

// Example companies; the names start with EKSEMPEL so they are never
// mistaken for real ones
const COMPANIES = {
  transport: "912345678",
  bygg: "923456789",
  data: "934567890",
  leverandor: "945678901",
} as const;

fake.setActive(
  brregEnhet(COMPANIES.transport, "EKSEMPEL TRANSPORT AS", {
    hjemmeside: "www.eksempel-transport.no",
  }),
);
fake.setActive(
  brregEnhet(COMPANIES.bygg, "EKSEMPEL BYGG AS", {
    forretningsadresse: {
      adresse: ["Bragernes torg 2"],
      postnummer: "3017",
      poststed: "DRAMMEN",
      kommune: "DRAMMEN",
      kommunenummer: "3301",
      land: "Norge",
      landkode: "NO",
    },
    naeringskode1: { kode: "41.000", beskrivelse: "Oppføring av bygninger" },
    antallAnsatte: 48,
    stiftelsesdato: "2009-06-15",
  }),
);
fake.setActive(
  brregEnhet(COMPANIES.data, "EKSEMPEL DATA AS", { konkurs: true }),
);
fake.setActive(brregEnhet(COMPANIES.leverandor, "EKSEMPEL LEVERANDØR AS"));

fake.setRoles(
  COMPANIES.transport,
  brregRoller({
    ceo: "Kari Nordmann",
    boardChair: "Ola Hansen",
    boardMembers: ["Ingrid Solberg", "Per Olsen"],
    deputyMembers: ["Anne Berg"],
    auditor: "EKSEMPEL REVISJON AS",
  }),
);
fake.setRoles(COMPANIES.bygg, brregRoller({ ceo: "Lars Moen" }));
fake.setRoles(COMPANIES.leverandor, brregRoller({ ceo: "Nina Dahl" }));

const thisYear = new Date().getUTCFullYear();
fake.setAccounts(COMPANIES.transport, [
  brregRegnskap({ id: 1, year: thisYear - 2, equity: 2_500_000 }),
  brregRegnskap({ id: 2, year: thisYear - 1, equity: 3_100_000 }),
]);
// Negative equity and two losses: a company with warning signs
const withResult = (accounts: BrregRegnskap, result: number) => {
  if (accounts.resultatregnskapResultat) {
    accounts.resultatregnskapResultat.aarsresultat = result;
  }
  return accounts;
};
fake.setAccounts(COMPANIES.bygg, [
  withResult(
    brregRegnskap({ id: 11, year: thisYear - 1, equity: -120_000 }),
    -350_000,
  ),
  withResult(
    brregRegnskap({ id: 12, year: thisYear - 2, equity: 230_000 }),
    -80_000,
  ),
]);

// Two years of new companies for the trends page, up to this month
fake.municipalities = [
  { kommunenummer: "3301", kommunenavnNorsk: "Drammen" },
  { kommunenummer: "0301", kommunenavnNorsk: "Oslo" },
  { kommunenummer: "5601", kommunenavnNorsk: "Alta" },
];
const industries = ["41.000", "62.100", "55.100", "56.101", "47.110"];
const now = new Date();
for (let monthsAgo = 24; monthsAgo >= 0; monthsAgo--) {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1),
  )
    .toISOString()
    .slice(0, 10);
  industries.forEach((code, index) => {
    fake.addRegistrations(2 + ((monthsAgo + index) % 4), {
      date,
      industry: { kode: code, beskrivelse: `Industry ${code}` },
      municipality: index % 2 === 0 ? "3301" : "5601",
    });
  });
}

// A fake language model: the first call asks for the user's watchlist
// (so the agent loop and "based on" are exercised), the second answers in
// Markdown. The answer also holds HTML and a javascript: link, which the
// web app must show as plain text and drop.
const ASSISTANT_ANSWER = [
  "Here is what I found in your watchlist:",
  "",
  "| Company | Risk |",
  "| --- | --- |",
  "| **EKSEMPEL BYGG AS** | Medium |",
  "",
  "- Read more on [Brønnøysundregistrene](https://www.brreg.no/).",
  "",
  "An [unsafe link](javascript:alert(1)) and an image: ![x](https://example.com/x.png)",
  "",
  "<script>window.__injected = true</script>",
].join("\n");

fake.extraHandlers.push(async (url, init) => {
  if (url.hostname !== "ollama.test") return null;
  const body = JSON.parse(String(init?.body)) as {
    messages: { role: string }[];
  };
  const toolAnswered = body.messages.some((m) => m.role === "tool");
  return Response.json({
    model: "e2e",
    created_at: new Date().toISOString(),
    message: toolAnswered
      ? { role: "assistant", content: ASSISTANT_ANSWER }
      : {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "list_watchlist", arguments: {} } }],
        },
    done: true,
    done_reason: "stop",
  });
});

// Emails go to a fake Resend; the tests read them from the control server
const resend = createFakeResend();
fake.extraHandlers.push(resend.handler);

globalThis.fetch = fakeFetch as typeof fetch;

// ---- 3. Control server for the tests ----

// POST /companies/{orgNumber}/bankrupt marks the company as bankrupt in
// the fake register and puts it in the update feed, as Brreg would.
// GET /emails?to={address} gives the emails sent to that address.
const controlPort = Number(process.env.E2E_CONTROL_PORT ?? 3199);
http
  .createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://control");
    if (request.method === "GET" && url.pathname === "/emails") {
      const to = url.searchParams.get("to");
      const emails = resend.sent.filter((email) => email.to.includes(to ?? ""));
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(emails));
      return;
    }
    const match = request.url?.match(/^\/companies\/(\d{9})\/bankrupt$/);
    const company = match ? fake.companies.get(match[1]!) : undefined;
    if (request.method !== "POST" || company?.kind !== "active") {
      response.writeHead(404).end();
      return;
    }
    company.enhet.konkurs = true;
    fake.addUpdate(company.enhet.organisasjonsnummer);
    response.writeHead(204).end();
  })
  .listen(controlPort, "127.0.0.1");

console.log(
  `End-to-end mode: fresh database "${databaseName}", fake services, control server on ${controlPort}`,
);

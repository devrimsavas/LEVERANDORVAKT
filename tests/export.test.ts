import { describe, expect, it } from "vitest";
import readExcelFile from "read-excel-file/node";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { runChangeDetectionOnce } from "../src/jobs/changeDetectionJob.js";
import { toCsv } from "../src/utils/csv.js";
import { localDate, wallClock } from "../src/utils/localTime.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import {
  brregEnhet,
  brregRegnskap,
  useFakeBrreg,
} from "./helpers/fakeBrreg.js";

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";
const ARCTIC_FISH = "923456789";
const NORDLYS = "934567890";

type Auth = Record<string, string>;

async function follow(auth: Auth, orgNumber: string, note?: string) {
  await request(app)
    .post("/api/watchlist")
    .set(auth)
    .send({ orgNumber, note })
    .expect(201);
}

async function setLanguage(person: typeof lukas, language: "en" | "nb") {
  await User.update({ language }, { where: { email: person.email } });
}

// Reads a CSV file the way a spreadsheet program does
function parseCsv(content: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]!;
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = "";
    } else if (char === "\r" && content[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
    } else cell += char;
  }
  return rows;
}

// The file as rows of named cells
function records(content: string, separator: string) {
  expect(content.startsWith("﻿")).toBe(true);
  const [header, ...rows] = parseCsv(content.slice(1), separator);
  return rows.map((row) =>
    Object.fromEntries(header!.map((name, i) => [name, row[i]])),
  );
}

const download = (auth: Auth, kind: "companies" | "changes") =>
  request(app)
    .get(`/api/watchlist/export/${kind}`)
    .set(auth)
    .buffer(true)
    .parse((res, done) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => done(null, text));
    });

describe("GET /api/watchlist/export/companies", () => {
  it("is a CSV file of the followed companies, sorted by name", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    brreg.setActive(
      brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS", { konkurs: true }),
    );
    brreg.setAccounts(ALTA_TOURS, [
      brregRegnskap({ id: 1, year: 2024, equity: 4_000_000 }),
      brregRegnskap({ id: 2, year: 2025, equity: 5_200_000 }),
    ]);
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ARCTIC_FISH);
    await follow(auth, ALTA_TOURS, "Our main supplier");

    const res = await download(auth, "companies");

    const today = localDate(new Date());
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename="leverandorvakt-companies-${today}.csv"`,
    );
    expect(res.headers["cache-control"]).toBe("no-store");

    const rows = records(res.body, ",");
    expect(rows.map((row) => row["Name"])).toEqual([
      "ALTA TOURS AS",
      "ARCTIC FISH AS",
    ]);
    expect(rows[0]).toEqual({
      "Organization number": ALTA_TOURS,
      Name: "ALTA TOURS AS",
      Status: "Active",
      "Organization form": "AS",
      "Industry code": "79.120",
      Industry: "Reisearrangørvirksomhet",
      Municipality: "ALTA",
      Employees: "12",
      "Risk level": expect.stringMatching(/^(Low|Medium|High)$/),
      "Risk score": expect.stringMatching(/^\d+$/),
      "Risk assessed": today,
      "Last change": "",
      "Accounts year": "2025",
      Currency: "NOK",
      Revenue: "",
      "Operating profit": "",
      "Net profit": "1000000",
      Equity: "5200000",
      "Total assets": "",
      "Followed since": today,
      Note: "Our main supplier",
    });
    expect(rows[1]).toMatchObject({
      Status: "Bankrupt",
      "Risk level": "High",
      "Accounts year": "",
      Note: "",
    });
  });

  it("is in Norwegian, with semicolons, for Norwegian users", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);
    await setLanguage(lukas, "nb");
    await follow(auth, ALTA_TOURS);

    const res = await download(auth, "companies");

    expect(res.headers["content-disposition"]).toContain(
      "leverandorvakt-selskaper-",
    );
    const [row] = records(res.body, ";");
    expect(row).toMatchObject({
      Organisasjonsnummer: ALTA_TOURS,
      Status: "Aktiv",
      Næring: "Reisearrangørvirksomhet",
      Risikonivå: expect.stringMatching(/^(Lav|Middels|Høy)$/),
    });
  });

  it("shows struck-off companies as such", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS);
    await runChangeDetectionOnce();
    brreg.setDeleted(ALTA_TOURS, "2026-11-01");
    brreg.addUpdate(ALTA_TOURS, "Sletting");
    await runChangeDetectionOnce();

    const [row] = records((await download(auth, "companies")).body, ",");

    expect(row!["Status"]).toBe("Struck off");
  });

  it("keeps notes as text, whatever they hold", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    brreg.setActive(brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS"));
    brreg.setActive(brregEnhet(NORDLYS, "NORDLYS AS"));
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, 'Contact: "Kari", phone 1, 2 or 3');
    await follow(auth, ARCTIC_FISH, "Line one\nline two");
    await follow(auth, NORDLYS, '=HYPERLINK("http://evil.example")');

    const res = await download(auth, "companies");

    expect(res.body).toContain('"Contact: ""Kari"", phone 1, 2 or 3"');
    const notes = records(res.body, ",").map((row) => row["Note"]);
    expect(notes).toEqual([
      'Contact: "Kari", phone 1, 2 or 3',
      "Line one\nline two",
      `'=HYPERLINK("http://evil.example")`,
    ]);
  });

  it("holds only the user's own companies and notes", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    brreg.setActive(brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS"));
    const lukasUser = await registerAndLogin(lukas);
    const kariUser = await registerAndLogin(kari);
    await follow(lukasUser.auth, ALTA_TOURS, "Lukas's note");
    await follow(kariUser.auth, ALTA_TOURS, "Kari's note");
    await follow(kariUser.auth, ARCTIC_FISH);

    const rows = records(
      (await download(lukasUser.auth, "companies")).body,
      ",",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!["Note"]).toBe("Lukas's note");
  });

  it("has only the header for an empty watchlist", async () => {
    const { auth } = await registerAndLogin(lukas);

    const res = await download(auth, "companies");

    expect(records(res.body, ",")).toEqual([]);
    expect(res.body.split("\r\n")[0]).toBe(
      "﻿Organization number,Name,Status,Organization form,Industry code,Industry,Municipality,Employees,Risk level,Risk score,Risk assessed,Last change,Accounts year,Currency,Revenue,Operating profit,Net profit,Equity,Total assets,Followed since,Note",
    );
  });

  it("needs a token", async () => {
    expect(
      (await request(app).get("/api/watchlist/export/companies")).status,
    ).toBe(401);
  });
});

describe("GET /api/watchlist/export/changes", () => {
  async function followAndChange() {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    brreg.setActive(brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS"));
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS);
    await runChangeDetectionOnce();
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA REISER AS"));
    brreg.addUpdate(ALTA_TOURS);
    await runChangeDetectionOnce();
    brreg.setActive(
      brregEnhet(ALTA_TOURS, "ALTA REISER AS", { konkurs: true }),
    );
    brreg.addUpdate(ALTA_TOURS);
    // A company the user does not follow
    brreg.addUpdate(ARCTIC_FISH);
    await runChangeDetectionOnce();
    return auth;
  }

  it("lists every change of the followed companies, newest first", async () => {
    const auth = await followAndChange();

    const res = await download(auth, "changes");

    expect(res.headers["content-disposition"]).toContain(
      "leverandorvakt-changes-",
    );
    const rows = records(res.body, ",");
    const changes = rows.filter((row) => row["Field"] !== "riskLevel");
    expect(changes).toEqual([
      {
        Detected: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
        "Organization number": ALTA_TOURS,
        Company: "ALTA REISER AS",
        Severity: "Critical",
        Change: "Bankruptcy registered",
        Before: "No",
        After: "Yes",
        Field: "isBankrupt",
      },
      expect.objectContaining({
        Severity: "Warning",
        Change: "New company name",
        Before: "ALTA TOURS AS",
        After: "ALTA REISER AS",
        Field: "name",
      }),
    ]);
    expect(rows.every((row) => row["Organization number"] === ALTA_TOURS)).toBe(
      true,
    );
  });

  it("is in Norwegian for Norwegian users", async () => {
    const auth = await followAndChange();
    await setLanguage(lukas, "nb");

    const rows = records((await download(auth, "changes")).body, ";");

    expect(rows.find((row) => row["Felt"] === "isBankrupt")).toMatchObject({
      Alvorlighet: "Kritisk",
      Endring: "Konkurs registrert",
      Før: "Nei",
      Etter: "Ja",
      Felt: "isBankrupt",
    });
  });

  it("is empty for a user who follows nothing", async () => {
    await followAndChange();
    const { auth } = await registerAndLogin(kari);

    expect(records((await download(auth, "changes")).body, ",")).toEqual([]);
  });
});

// Downloads the Excel file and reads its sheets the way Excel does
async function downloadExcel(auth: Auth) {
  const res = await request(app)
    .get("/api/watchlist/export/excel")
    .set(auth)
    .buffer(true)
    .parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => done(null, Buffer.concat(chunks)));
    });
  const sheets = await readExcelFile(res.body as Buffer);
  return { res, sheets };
}

describe("GET /api/watchlist/export/excel", () => {
  it("is one Excel file with the companies and their changes", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    brreg.setAccounts(ALTA_TOURS, [
      brregRegnskap({ id: 1, year: 2025, equity: 5_200_000 }),
    ]);
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, '=HYPERLINK("http://evil.example")');
    await runChangeDetectionOnce();
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA REISER AS"));
    brreg.addUpdate(ALTA_TOURS);
    await runChangeDetectionOnce();

    const { res, sheets } = await downloadExcel(auth);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename="leverandorvakt-watchlist-${localDate(new Date())}.xlsx"`,
    );
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(sheets.map((sheet) => sheet.sheet)).toEqual([
      "Companies",
      "Changes",
    ]);

    const [companies, changes] = sheets.map((sheet) => sheet.data);
    expect(companies![0]![0]).toBe("Organization number");
    const company = Object.fromEntries(
      companies![0]!.map((name, i) => [name, companies![1]![i]]),
    );
    const followedAt = (
      await request(app).get(`/api/watchlist/${ALTA_TOURS}`).set(auth)
    ).body.followedSince;
    expect(company).toMatchObject({
      // Codes stay text, so Excel does not turn 79.120 into 79.12
      "Organization number": ALTA_TOURS,
      "Industry code": "79.120",
      "Organization form": "AS",
      Name: "ALTA REISER AS",
      Status: "Active",
      Employees: 12,
      "Accounts year": 2025,
      Equity: 5_200_000,
      "Net profit": 1_000_000,
      // A note is text, never a formula
      Note: '=HYPERLINK("http://evil.example")',
    });
    // Dates are real dates: the day in Norway, without a time
    const followed = wallClock(new Date(followedAt));
    expect(company["Followed since"]).toEqual(
      new Date(
        Date.UTC(
          followed.getUTCFullYear(),
          followed.getUTCMonth(),
          followed.getUTCDate(),
        ),
      ),
    );

    expect(changes![0]).toEqual([
      "Detected",
      "Organization number",
      "Company",
      "Severity",
      "Change",
      "Before",
      "After",
      "Field",
    ]);
    const name = changes!.find((row) => row[7] === "name");
    expect(name).toEqual([
      expect.any(Date),
      ALTA_TOURS,
      "ALTA REISER AS",
      "Warning",
      "New company name",
      "ALTA TOURS AS",
      "ALTA REISER AS",
      "name",
    ]);
  });

  it("is in Norwegian for Norwegian users", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);
    await setLanguage(lukas, "nb");
    await follow(auth, ALTA_TOURS);

    const { res, sheets } = await downloadExcel(auth);

    expect(res.headers["content-disposition"]).toContain(
      "leverandorvakt-folgeliste-",
    );
    expect(sheets.map((sheet) => sheet.sheet)).toEqual([
      "Selskaper",
      "Endringer",
    ]);
    expect(sheets[0]!.data[0]![0]).toBe("Organisasjonsnummer");
    expect(sheets[0]!.data[1]![2]).toBe("Aktiv");
  });

  it("has the headers alone for an empty watchlist", async () => {
    const { auth } = await registerAndLogin(lukas);

    const { sheets } = await downloadExcel(auth);

    expect(sheets.map((sheet) => sheet.data.length)).toEqual([1, 1]);
  });

  it("needs a token", async () => {
    expect((await request(app).get("/api/watchlist/export/excel")).status).toBe(
      401,
    );
  });
});

describe("wallClock", () => {
  it("holds the time in Norway, in winter and in summer", () => {
    expect(wallClock(new Date("2026-11-16T07:30:00Z")).toISOString()).toBe(
      "2026-11-16T08:30:00.000Z",
    );
    expect(wallClock(new Date("2027-06-14T07:30:00Z")).toISOString()).toBe(
      "2027-06-14T09:30:00.000Z",
    );
  });
});

describe("toCsv", () => {
  it("leaves numbers as they are, negative ones too", () => {
    expect(toCsv(["a", "b"], [[-50000, "-50000"]], ";")).toBe(
      "﻿a;b\r\n-50000;'-50000\r\n",
    );
  });

  it("quotes text holding the separator, and only then", () => {
    expect(toCsv(["a"], [["1,5"], ["1;5"]], ";")).toBe(
      '﻿a\r\n1,5\r\n"1;5"\r\n',
    );
  });
});

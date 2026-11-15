// The user's watchlist and its change history as files for Excel or
// Power BI: one Excel file with a sheet for each, or a CSV file of either.
// Both are made from the same tables. Column names and texts are in the
// user's language; codes that do not depend on it (organization number,
// form, industry code, the changed field) have columns of their own, so
// reports built on the files keep working when the language changes.
import { Op } from "sequelize";
import writeExcelFile, {
  type Cell,
  type SheetData,
} from "write-excel-file/node";
import { User, type Language } from "../models/User.js";
import { WatchlistEntry } from "../models/WatchlistEntry.js";
import { CompanyChange } from "../models/CompanyChange.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { getWatchlist, type WatchlistItem } from "./watchlistService.js";
import { UserNotFoundError } from "./userService.js";
import {
  changeTitle,
  changeValues,
  riskLevelLabel,
  severityLabel,
} from "./email/changeTexts.js";
import { toCsv, type CsvValue } from "../utils/csv.js";
import { localDate, localDateTime, wallClock } from "../utils/localTime.js";

// More changes than this are left out, oldest first
export const MAX_EXPORTED_CHANGES = 10_000;

export interface ExportFile {
  filename: string;
  contentType: string;
  content: string | Buffer;
}

// What a column holds, which decides how each file shows it:
//   text     plain text
//   code     text that looks like a number (61.100, 912345678), kept as
//            text so Excel does not turn it into one
//   number   a count or a score
//   amount   money, with a thousands separator in Excel
//   year     a year, without a thousands separator
//   date     a day; dateTime a day and a time, in Norwegian time
type ColumnKind =
  "text" | "code" | "number" | "amount" | "year" | "date" | "dateTime";
type Value = string | number | Date | null;

interface Column {
  header: Record<Language, string>;
  kind: ColumnKind;
  // Width in Excel, in characters
  width: number;
}

interface Table {
  sheet: Record<Language, string>;
  columns: Column[];
  rows: Value[][];
}

const column = (
  en: string,
  nb: string,
  kind: ColumnKind,
  width: number,
): Column => ({ header: { en, nb }, kind, width });

const COMPANY_COLUMNS: Column[] = [
  column("Organization number", "Organisasjonsnummer", "code", 20),
  column("Name", "Navn", "text", 32),
  column("Status", "Status", "text", 18),
  column("Organization form", "Organisasjonsform", "code", 18),
  column("Industry code", "Næringskode", "code", 14),
  column("Industry", "Næring", "text", 36),
  column("Municipality", "Kommune", "text", 16),
  column("Employees", "Ansatte", "number", 11),
  column("Risk level", "Risikonivå", "text", 12),
  column("Risk score", "Risikopoeng", "number", 12),
  column("Risk assessed", "Risiko vurdert", "date", 14),
  column("Last change", "Sist endret", "date", 14),
  column("Accounts year", "Regnskapsår", "year", 14),
  column("Currency", "Valuta", "code", 10),
  column("Revenue", "Driftsinntekter", "amount", 16),
  column("Operating profit", "Driftsresultat", "amount", 16),
  column("Net profit", "Årsresultat", "amount", 16),
  column("Equity", "Egenkapital", "amount", 16),
  column("Total assets", "Sum eiendeler", "amount", 16),
  column("Followed since", "Fulgt siden", "date", 14),
  column("Note", "Notat", "text", 40),
];

const CHANGE_COLUMNS: Column[] = [
  column("Detected", "Oppdaget", "dateTime", 18),
  column("Organization number", "Organisasjonsnummer", "code", 20),
  column("Company", "Selskap", "text", 32),
  column("Severity", "Alvorlighet", "text", 12),
  column("Change", "Endring", "text", 34),
  column("Before", "Før", "text", 30),
  column("After", "Etter", "text", 30),
  column("Field", "Felt", "code", 26),
];

const SHEETS = {
  companies: { en: "Companies", nb: "Selskaper" },
  changes: { en: "Changes", nb: "Endringer" },
} satisfies Record<string, Record<Language, string>>;

const STATUSES = {
  en: {
    struckOff: "Struck off",
    bankrupt: "Bankrupt",
    forcedLiquidation: "Forced liquidation",
    liquidation: "Being wound up",
    active: "Active",
  },
  nb: {
    struckOff: "Slettet",
    bankrupt: "Konkurs",
    forcedLiquidation: "Tvangsavvikling",
    liquidation: "Under avvikling",
    active: "Aktiv",
  },
} satisfies Record<Language, Record<string, string>>;

// File names without æ, ø and å, which not every program handles in a
// download's name
const FILE_NAMES = {
  en: { companies: "companies", changes: "changes", excel: "watchlist" },
  nb: { companies: "selskaper", changes: "endringer", excel: "folgeliste" },
} satisfies Record<Language, Record<string, string>>;

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// The most serious state first: a struck-off company may also be bankrupt
function statusOf(item: WatchlistItem, language: Language): string {
  const words = STATUSES[language];
  if (item.deletedFromRegistryAt) return words.struckOff;
  if (item.company.isBankrupt) return words.bankrupt;
  if (item.company.isUnderForcedLiquidation) return words.forcedLiquidation;
  if (item.company.isUnderLiquidation) return words.liquidation;
  return words.active;
}

function companyRow(item: WatchlistItem, language: Language): Value[] {
  const { company, risk } = item;
  const accounts = item.accounts.latest;
  return [
    item.orgNumber,
    item.name,
    statusOf(item, language),
    company.organizationForm,
    company.industryCode,
    company.industryDescription,
    company.address?.municipality ?? null,
    company.employees,
    risk.level ? riskLevelLabel(language, risk.level) : null,
    risk.score,
    risk.assessedAt,
    item.lastChangedAt,
    accounts?.year ?? null,
    accounts?.currency ?? null,
    accounts?.figures.revenue ?? null,
    accounts?.figures.operatingProfit ?? null,
    accounts?.figures.netProfit ?? null,
    accounts?.figures.equity ?? null,
    accounts?.figures.totalAssets ?? null,
    item.followedSince,
    item.note,
  ];
}

async function userFor(userPublicId: string): Promise<User> {
  const user = await User.findOne({ where: { publicId: userPublicId } });
  if (!user) throw new UserNotFoundError("User not found");
  return user;
}

// Every followed company with its status, risk and latest key figures,
// sorted by name, with the user's own note
async function companiesTable(user: User): Promise<Table> {
  const items = await getWatchlist(user.publicId, "name");
  return {
    sheet: SHEETS.companies,
    columns: COMPANY_COLUMNS,
    rows: items.map((item) => companyRow(item, user.language)),
  };
}

// Every recorded change of the followed companies, newest first
async function changesTable(user: User): Promise<Table> {
  const language = user.language;
  const followed = await WatchlistEntry.findAll({
    where: { userId: user.id },
    attributes: ["companyId"],
  });
  const changes = await CompanyChange.findAll({
    where: { companyId: { [Op.in]: followed.map((entry) => entry.companyId) } },
    include: [{ model: CompanyRecord, attributes: ["orgNumber", "name"] }],
    order: [
      ["detectedAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: MAX_EXPORTED_CHANGES,
  });

  return {
    sheet: SHEETS.changes,
    columns: CHANGE_COLUMNS,
    rows: changes.map((change) => {
      const { before, after } = changeValues(
        language,
        change.field,
        change.oldValue,
        change.newValue,
      );
      return [
        change.detectedAt,
        change.company.orgNumber,
        change.company.name,
        severityLabel(language, change.severity),
        changeTitle(language, change.field, change.newValue),
        before,
        after,
        change.field,
      ];
    }),
  };
}

function filename(language: Language, kind: "companies" | "changes" | "excel") {
  const extension = kind === "excel" ? "xlsx" : "csv";
  return `leverandorvakt-${FILE_NAMES[language][kind]}-${localDate(new Date())}.${extension}`;
}

// CSV: dates as text in Norwegian time (2026-11-16, 2026-11-16 08:30);
// Norwegian Excel expects semicolons, since it uses the comma for decimals
function toCsvFile(table: Table, language: Language, name: string): ExportFile {
  const rows = table.rows.map((row) =>
    row.map((value, index): CsvValue => {
      if (!(value instanceof Date)) return value;
      return table.columns[index]!.kind === "dateTime"
        ? localDateTime(value)
        : localDate(value);
    }),
  );
  return {
    filename: name,
    contentType: "text/csv; charset=utf-8",
    content: toCsv(
      table.columns.map((c) => c.header[language]),
      rows,
      language === "nb" ? ";" : ",",
    ),
  };
}

const HEADER_STYLE = {
  fontWeight: "bold",
  backgroundColor: "#E6EEF7",
  bottomBorderStyle: "thin",
  bottomBorderColor: "#0062BA",
} as const;

// Formats are codes Excel reads the same everywhere; it shows them with
// the reader's own separators (1 234 567 in Norwegian, 1,234,567 in English)
// The day in Norway, at midnight, without a hidden time of day
function dayOf(value: Date): Date {
  const local = wallClock(value);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

function xlsxCell(value: Value, kind: ColumnKind): Cell {
  if (value === null) return null;
  switch (kind) {
    case "code":
    case "text":
      // "@" marks the cell as text, so Excel never reads it as a number
      return { value: String(value), type: String, format: "@" };
    case "amount":
      return { value: Number(value), type: Number, format: "#,##0" };
    case "number":
    case "year":
      return { value: Number(value), type: Number, format: "0" };
    case "date":
      return value instanceof Date
        ? { value: dayOf(value), type: Date, format: "yyyy-mm-dd" }
        : String(value);
    case "dateTime":
      return value instanceof Date
        ? { value: wallClock(value), type: Date, format: "yyyy-mm-dd hh:mm" }
        : String(value);
  }
}

function toSheet(table: Table, language: Language) {
  const data: SheetData = [
    table.columns.map((c) => ({ value: c.header[language], ...HEADER_STYLE })),
    ...table.rows.map((row) =>
      row.map((value, index) => xlsxCell(value, table.columns[index]!.kind)),
    ),
  ];
  return {
    data,
    sheet: table.sheet[language],
    columns: table.columns.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
  };
}

export async function exportWatchlistCsv(
  userPublicId: string,
): Promise<ExportFile> {
  const user = await userFor(userPublicId);
  return toCsvFile(
    await companiesTable(user),
    user.language,
    filename(user.language, "companies"),
  );
}

export async function exportChangesCsv(
  userPublicId: string,
): Promise<ExportFile> {
  const user = await userFor(userPublicId);
  return toCsvFile(
    await changesTable(user),
    user.language,
    filename(user.language, "changes"),
  );
}

// One Excel file with the companies and their changes, a sheet for each
export async function exportWatchlistExcel(
  userPublicId: string,
): Promise<ExportFile> {
  const user = await userFor(userPublicId);
  const sheets = [
    toSheet(await companiesTable(user), user.language),
    toSheet(await changesTable(user), user.language),
  ];
  return {
    filename: filename(user.language, "excel"),
    contentType: XLSX_TYPE,
    content: await writeExcelFile(sheets).toBuffer(),
  };
}

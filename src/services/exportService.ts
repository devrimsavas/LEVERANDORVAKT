// The user's watchlist and its change history as CSV files, for Excel or
// Power BI. Column names and texts are in the user's language; codes that
// do not depend on it (organization number, form, industry code, the
// changed field) have columns of their own, so reports built on the files
// keep working when the language changes.
import { Op } from "sequelize";
import { User, type Language } from "../models/User.js";
import { WatchlistEntry } from "../models/WatchlistEntry.js";
import { CompanyChange } from "../models/CompanyChange.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { getWatchlist, type WatchlistItem } from "./watchlistService.js";
import {
  changeTitle,
  changeValues,
  riskLevelLabel,
  severityLabel,
} from "./email/changeTexts.js";
import { UserNotFoundError } from "./userService.js";
import { toCsv, type CsvValue } from "../utils/csv.js";
import { localDate, localDateTime } from "../utils/localTime.js";

// More changes than this are left out, oldest first
export const MAX_EXPORTED_CHANGES = 10_000;

export interface CsvFile {
  filename: string;
  content: string;
}

const COMPANY_COLUMNS = {
  en: [
    "Organization number",
    "Name",
    "Status",
    "Organization form",
    "Industry code",
    "Industry",
    "Municipality",
    "Employees",
    "Risk level",
    "Risk score",
    "Risk assessed",
    "Last change",
    "Accounts year",
    "Currency",
    "Revenue",
    "Operating profit",
    "Net profit",
    "Equity",
    "Total assets",
    "Followed since",
    "Note",
  ],
  nb: [
    "Organisasjonsnummer",
    "Navn",
    "Status",
    "Organisasjonsform",
    "Næringskode",
    "Næring",
    "Kommune",
    "Ansatte",
    "Risikonivå",
    "Risikopoeng",
    "Risiko vurdert",
    "Sist endret",
    "Regnskapsår",
    "Valuta",
    "Driftsinntekter",
    "Driftsresultat",
    "Årsresultat",
    "Egenkapital",
    "Sum eiendeler",
    "Fulgt siden",
    "Notat",
  ],
} satisfies Record<Language, string[]>;

const CHANGE_COLUMNS = {
  en: [
    "Detected",
    "Organization number",
    "Company",
    "Severity",
    "Change",
    "Before",
    "After",
    "Field",
  ],
  nb: [
    "Oppdaget",
    "Organisasjonsnummer",
    "Selskap",
    "Alvorlighet",
    "Endring",
    "Før",
    "Etter",
    "Felt",
  ],
} satisfies Record<Language, string[]>;

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

const FILE_NAMES = {
  en: { companies: "companies", changes: "changes" },
  nb: { companies: "selskaper", changes: "endringer" },
} satisfies Record<Language, Record<string, string>>;

const separator = (language: Language) => (language === "nb" ? ";" : ",");

const date = (value: Date | null) => (value ? localDate(value) : null);

// The most serious state first: a struck-off company may also be bankrupt
function statusOf(item: WatchlistItem, language: Language): string {
  const words = STATUSES[language];
  if (item.deletedFromRegistryAt) return words.struckOff;
  if (item.company.isBankrupt) return words.bankrupt;
  if (item.company.isUnderForcedLiquidation) return words.forcedLiquidation;
  if (item.company.isUnderLiquidation) return words.liquidation;
  return words.active;
}

function companyRow(item: WatchlistItem, language: Language): CsvValue[] {
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
    date(risk.assessedAt),
    date(item.lastChangedAt),
    accounts?.year ?? null,
    accounts?.currency ?? null,
    accounts?.figures.revenue ?? null,
    accounts?.figures.operatingProfit ?? null,
    accounts?.figures.netProfit ?? null,
    accounts?.figures.equity ?? null,
    accounts?.figures.totalAssets ?? null,
    date(item.followedSince),
    item.note,
  ];
}

async function userFor(userPublicId: string): Promise<User> {
  const user = await User.findOne({ where: { publicId: userPublicId } });
  if (!user) throw new UserNotFoundError("User not found");
  return user;
}

function filename(language: Language, kind: "companies" | "changes") {
  return `leverandorvakt-${FILE_NAMES[language][kind]}-${localDate(new Date())}.csv`;
}

// Every followed company with its status, risk and latest key figures,
// sorted by name, with the user's own note
export async function exportWatchlist(userPublicId: string): Promise<CsvFile> {
  const user = await userFor(userPublicId);
  const items = await getWatchlist(userPublicId, "name");
  return {
    filename: filename(user.language, "companies"),
    content: toCsv(
      COMPANY_COLUMNS[user.language],
      items.map((item) => companyRow(item, user.language)),
      separator(user.language),
    ),
  };
}

// Every recorded change of the followed companies, newest first
export async function exportChanges(userPublicId: string): Promise<CsvFile> {
  const user = await userFor(userPublicId);
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

  const rows = changes.map((change): CsvValue[] => {
    const { before, after } = changeValues(
      language,
      change.field,
      change.oldValue,
      change.newValue,
    );
    return [
      localDateTime(change.detectedAt),
      change.company.orgNumber,
      change.company.name,
      severityLabel(language, change.severity),
      changeTitle(language, change.field, change.newValue),
      before,
      after,
      change.field,
    ];
  });

  return {
    filename: filename(language, "changes"),
    content: toCsv(CHANGE_COLUMNS[language], rows, separator(language)),
  };
}

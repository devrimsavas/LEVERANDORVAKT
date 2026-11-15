import type { Language } from "../../models/User.js";

// How a stored change is described in an email, in English and Norwegian.
// The wording is the same as the web app's (web/messages, "changes" and
// "changeValues"), so a change reads the same in the app and the inbox.

const TITLES: Record<Language, Record<string, string>> = {
  en: {
    other: "Changed in the register",
    name: "New company name",
    organizationForm: "New organization form",
    website: "New website",
    address: "New business address",
    industryCode: "New industry",
    employees: "Number of employees changed",
    foundedDate: "Founding date corrected",
    isBankrupt_yes: "Bankruptcy registered",
    isBankrupt_no: "Bankruptcy no longer registered",
    isUnderLiquidation_yes: "Liquidation started",
    isUnderLiquidation_no: "Liquidation no longer registered",
    isUnderForcedLiquidation_yes: "Forced liquidation started",
    isUnderForcedLiquidation_no: "Forced liquidation no longer registered",
    deletedFromRegistry_yes: "Removed from the register",
    deletedFromRegistry_no: "Back in the register",
    lastAnnualAccountsYear: "Annual accounts filed",
    roles_ceo: "New CEO",
    roles_boardChair: "New chair of the board",
    roles_deputyChair: "New deputy chair",
    roles_boardMembers: "Board members changed",
    roles_deputyMembers: "Deputy board members changed",
    roles_auditor: "Auditor changed",
    roles_accountant: "Accountant changed",
    annualAccounts_filed: "New annual accounts",
    annualAccounts_corrected: "Annual accounts corrected",
    annualAccounts_liquidation: "Accounts prepared for liquidation",
    annualAccounts_negativeEquity: "Equity turned negative",
    annualAccounts_auditDropped: "Accounts no longer audited",
    riskLevel: "Risk level changed",
  },
  nb: {
    other: "Endret i registeret",
    name: "Nytt selskapsnavn",
    organizationForm: "Ny organisasjonsform",
    website: "Ny hjemmeside",
    address: "Ny forretningsadresse",
    industryCode: "Ny bransje",
    employees: "Antall ansatte endret",
    foundedDate: "Stiftelsesdato rettet",
    isBankrupt_yes: "Konkurs registrert",
    isBankrupt_no: "Konkurs ikke lenger registrert",
    isUnderLiquidation_yes: "Avvikling startet",
    isUnderLiquidation_no: "Avvikling ikke lenger registrert",
    isUnderForcedLiquidation_yes: "Tvangsavvikling startet",
    isUnderForcedLiquidation_no: "Tvangsavvikling ikke lenger registrert",
    deletedFromRegistry_yes: "Slettet fra registeret",
    deletedFromRegistry_no: "Tilbake i registeret",
    lastAnnualAccountsYear: "Årsregnskap levert",
    roles_ceo: "Ny daglig leder",
    roles_boardChair: "Ny styreleder",
    roles_deputyChair: "Ny nestleder",
    roles_boardMembers: "Styremedlemmer endret",
    roles_deputyMembers: "Varamedlemmer endret",
    roles_auditor: "Revisor endret",
    roles_accountant: "Regnskapsfører endret",
    annualAccounts_filed: "Nytt årsregnskap",
    annualAccounts_corrected: "Årsregnskap korrigert",
    annualAccounts_liquidation: "Regnskap avlagt ved avvikling",
    annualAccounts_negativeEquity: "Negativ egenkapital",
    annualAccounts_auditDropped: "Regnskapet revideres ikke lenger",
    riskLevel: "Risikonivå endret",
  },
};

const WORDS = {
  en: {
    yes: "Yes",
    no: "No",
    risk: (level: string, score: number) => `${level} (${score} points)`,
    equity: (amount: string, year: string) => `${amount} at the end of ${year}`,
    audited: (year: string) => `Audited (${year})`,
    notAudited: (year: string) => `Not audited (${year})`,
    accountsFor: (year: string) => `Accounts for ${year}`,
    levels: { low: "Low", medium: "Medium", high: "High" } as Record<
      string,
      string
    >,
    severity: {
      critical: "Critical",
      warning: "Warning",
      info: "Info",
    } as Record<string, string>,
    locale: "en-GB",
  },
  nb: {
    yes: "Ja",
    no: "Nei",
    risk: (level: string, score: number) => `${level} (${score} poeng)`,
    equity: (amount: string, year: string) =>
      `${amount} ved utgangen av ${year}`,
    audited: (year: string) => `Revidert (${year})`,
    notAudited: (year: string) => `Ikke revidert (${year})`,
    accountsFor: (year: string) => `Regnskap for ${year}`,
    levels: { low: "Lav", medium: "Middels", high: "Høy" } as Record<
      string,
      string
    >,
    severity: {
      critical: "Kritisk",
      warning: "Advarsel",
      info: "Info",
    } as Record<string, string>,
    locale: "nb-NO",
  },
};

const YES_NO_FIELDS = new Set([
  "isBankrupt",
  "isUnderLiquidation",
  "isUnderForcedLiquidation",
  "deletedFromRegistry",
]);

const NONE = "–";

export function changeTitle(
  language: Language,
  field: string,
  newValue: unknown,
): string {
  const key = YES_NO_FIELDS.has(field)
    ? `${field}_${newValue ? "yes" : "no"}`
    : field.replace(/\./g, "_");
  return TITLES[language][key] ?? TITLES[language].other!;
}

export function severityLabel(language: Language, severity: string): string {
  return WORDS[language].severity[severity] ?? severity;
}

function plainValue(language: Language, value: unknown): string {
  const words = WORDS[language];
  if (value === null || value === undefined || value === "") return NONE;
  if (typeof value === "boolean") return value ? words.yes : words.no;
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : NONE;
  if (typeof value === "object") {
    const v = value as { postalCode?: string; city?: string; year?: number };
    if ("postalCode" in v || "city" in v) {
      return [v.postalCode, v.city].filter(Boolean).join(" ") || NONE;
    }
    if (typeof v.year === "number") return String(v.year);
    return NONE;
  }
  return String(value);
}

type ValueObject = Record<string, unknown> | null;

// The value before and after a change, as short text
export function changeValues(
  language: Language,
  field: string,
  oldValue: unknown,
  newValue: unknown,
): { before: string; after: string } {
  const words = WORDS[language];
  const before = oldValue as ValueObject;
  const after = newValue as ValueObject;
  const money = (amount: unknown, currency: unknown) =>
    typeof amount !== "number"
      ? NONE
      : new Intl.NumberFormat(words.locale, {
          maximumFractionDigits: 0,
          ...(typeof currency === "string"
            ? { style: "currency", currency }
            : {}),
        }).format(amount);

  switch (field) {
    case "riskLevel": {
      const show = (v: ValueObject) =>
        v && typeof v.level === "string"
          ? words.risk(words.levels[v.level] ?? v.level, Number(v.score ?? 0))
          : NONE;
      return { before: show(before), after: show(after) };
    }
    case "annualAccounts.negativeEquity": {
      const show = (v: ValueObject) =>
        v ? words.equity(money(v.equity, v.currency), String(v.year)) : NONE;
      return { before: show(before), after: show(after) };
    }
    case "annualAccounts.auditDropped":
      return {
        before: before ? words.audited(String(before.year)) : NONE,
        after: after ? words.notAudited(String(after.year)) : NONE,
      };
    case "annualAccounts.filed":
    case "annualAccounts.corrected":
    case "annualAccounts.liquidation":
      return {
        before: NONE,
        after: after ? words.accountsFor(String(after.year)) : NONE,
      };
    default:
      return {
        before: plainValue(language, oldValue),
        after: plainValue(language, newValue),
      };
  }
}

import type { BrregRegnskap } from "../types/regnskap.js";
import type { AnnualAccounts } from "../types/annualAccounts.js";

// Converts one set of accounts from Brreg's format into the app's own shape.
export function toAnnualAccounts(regnskap: BrregRegnskap): AnnualAccounts {
  const result = regnskap.resultatregnskapResultat;
  const balance = regnskap.eiendeler;
  const equityAndDebt = regnskap.egenkapitalGjeld;
  const debt = equityAndDebt?.gjeldOversikt;

  return {
    brregId: regnskap.id,
    year: Number(regnskap.regnskapsperiode.tilDato.slice(0, 4)),
    periodStart: regnskap.regnskapsperiode.fraDato,
    periodEnd: regnskap.regnskapsperiode.tilDato,
    type: regnskap.regnskapstype === "KONSERN" ? "group" : "company",
    currency: regnskap.valuta ?? null,
    accountingRules: regnskap.regnkapsprinsipper?.regnskapsregler ?? null,

    audited: !(regnskap.revisjon?.ikkeRevidertAarsregnskap ?? false),
    auditOptedOut: regnskap.revisjon?.fravalgRevisjon ?? false,
    liquidation: regnskap.avviklingsregnskap ?? false,

    figures: {
      revenue:
        result?.driftsresultat?.driftsinntekter?.sumDriftsinntekter ?? null,
      operatingExpenses:
        result?.driftsresultat?.driftskostnad?.sumDriftskostnad ?? null,
      operatingProfit: result?.driftsresultat?.driftsresultat ?? null,
      netFinancialItems: result?.finansresultat?.nettoFinans ?? null,
      profitBeforeTax: result?.ordinaertResultatFoerSkattekostnad ?? null,
      taxExpense: result?.ordinaertResultatSkattekostnad ?? null,
      netProfit: result?.aarsresultat ?? null,

      totalAssets: balance?.sumEiendeler ?? null,
      fixedAssets: balance?.anleggsmidler?.sumAnleggsmidler ?? null,
      currentAssets: balance?.omloepsmidler?.sumOmloepsmidler ?? null,
      cash: balance?.sumBankinnskuddOgKontanter ?? null,
      equity: equityAndDebt?.egenkapital?.sumEgenkapital ?? null,
      totalDebt: debt?.sumGjeld ?? null,
      shortTermDebt: debt?.kortsiktigGjeld?.sumKortsiktigGjeld ?? null,
      longTermDebt: debt?.langsiktigGjeld?.sumLangsiktigGjeld ?? null,
    },
  };
}

// Converts all accounts of a company, newest first.
// Within the same period the company's own accounts come before the group's.
export function toAnnualAccountsList(list: BrregRegnskap[]): AnnualAccounts[] {
  const typeOrder = { company: 0, group: 1 };

  return list
    .map(toAnnualAccounts)
    .sort(
      (a, b) =>
        b.periodEnd.localeCompare(a.periodEnd) ||
        typeOrder[a.type] - typeOrder[b.type],
    );
}

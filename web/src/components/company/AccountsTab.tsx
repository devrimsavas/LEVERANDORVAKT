import { getFormatter, getTranslations } from "next-intl/server";
import {
  Alert,
  Heading,
  Paragraph,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@digdir/designsystemet-react";
import { getCompanyAccounts } from "@/lib/companies";
import type { AnnualAccounts, AnnualAccountsFigures } from "@/lib/companyTypes";
import { CHART_METRICS, type ChartYear } from "@/lib/accountsChart";
import { AccountsChart } from "./AccountsChart";
import styles from "./company.module.css";

// The key figures shown, in the usual order of an income statement and a
// balance sheet
const ROWS = [
  "revenue",
  "operatingProfit",
  "profitBeforeTax",
  "netProfit",
  "totalAssets",
  "equity",
  "totalDebt",
  "cash",
] as const satisfies readonly (keyof AnnualAccountsFigures)[];
const YEARS_SHOWN = 5;

export async function AccountsTab({
  orgNumber,
  followed,
}: {
  orgNumber: string;
  followed: boolean;
}) {
  const t = await getTranslations("company.accounts");
  const result = await getCompanyAccounts(orgNumber, followed);

  if (result.status !== "ok") {
    return <Alert data-color="warning">{t("unavailable")}</Alert>;
  }
  const { status, accounts } = result.data;
  if (status === "unsupported") {
    return <Alert data-color="info">{t("unsupported")}</Alert>;
  }
  if (status === null) {
    return <Alert data-color="info">{t("notChecked")}</Alert>;
  }
  if (accounts.length === 0) {
    return <Paragraph>{t("none")}</Paragraph>;
  }

  const own = accounts
    .filter((a) => a.type === "company")
    .slice(0, YEARS_SHOWN);
  const group = accounts
    .filter((a) => a.type === "group")
    .slice(0, YEARS_SHOWN);

  return (
    <div className={styles.stack}>
      {own.length > 0 && <AccountsTable title={t("own")} accounts={own} />}
      {group.length > 0 && (
        <AccountsTable
          title={t("group")}
          accounts={group}
          note={t("groupNote")}
        />
      )}
      <Paragraph data-size="sm" className={styles.source}>
        {t("source")}
      </Paragraph>
    </div>
  );
}

async function AccountsTable({
  title,
  accounts,
  note,
}: {
  title: string;
  accounts: AnnualAccounts[];
  note?: string;
}) {
  const t = await getTranslations("company.accounts");
  const format = await getFormatter();
  const amount = (value: number | null) =>
    value === null ? "–" : format.number(value, { maximumFractionDigits: 0 });

  // The chart compares years, so it is left out when they were reported in
  // different currencies (the table still shows each year in its own)
  const currencies = new Set(accounts.map((a) => a.currency));
  const chartYears: ChartYear[] = [...accounts].reverse().map((a) => ({
    year: a.year,
    values: Object.fromEntries(
      CHART_METRICS.map((m) => [m, a.figures[m]]),
    ) as ChartYear["values"],
  }));
  const showChart = currencies.size === 1 && accounts.length >= 2;

  return (
    <section className={styles.stack}>
      <Heading level={2} data-size="xs">
        {title}
      </Heading>
      {note && <Paragraph data-size="sm">{note}</Paragraph>}
      {showChart ? (
        <AccountsChart years={chartYears} currency={accounts[0]!.currency} />
      ) : (
        accounts.length >= 2 && (
          <Paragraph data-size="sm">{t("chart.mixedCurrencies")}</Paragraph>
        )
      )}
      <div className={styles.tableWrap}>
        <Table zebra className={styles.figures}>
          <caption className="visually-hidden">{title}</caption>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t("figure")}</TableHeaderCell>
              {accounts.map((a) => (
                <TableHeaderCell key={a.periodEnd} className={styles.number}>
                  {a.year}
                  <span className={styles.currency}>{a.currency ?? ""}</span>
                </TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {ROWS.map((row) => (
              <TableRow key={row}>
                <TableHeaderCell scope="row">
                  {t(`rows.${row}`)}
                </TableHeaderCell>
                {accounts.map((a) => {
                  const value = a.figures[row];
                  return (
                    <TableCell
                      key={a.periodEnd}
                      className={`${styles.number} ${value !== null && value < 0 ? styles.negative : ""}`}
                    >
                      {amount(value)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            <TableRow>
              <TableHeaderCell scope="row">
                {t("rows.equityRatio")}
              </TableHeaderCell>
              {accounts.map((a) => {
                const { equity, totalAssets } = a.figures;
                const ratio =
                  equity !== null && totalAssets ? equity / totalAssets : null;
                return (
                  <TableCell
                    key={a.periodEnd}
                    className={`${styles.number} ${ratio !== null && ratio < 0 ? styles.negative : ""}`}
                  >
                    {ratio === null
                      ? "–"
                      : format.number(ratio, {
                          style: "percent",
                          maximumFractionDigits: 1,
                        })}
                  </TableCell>
                );
              })}
            </TableRow>
            <TableRow>
              <TableHeaderCell scope="row">{t("rows.audit")}</TableHeaderCell>
              {accounts.map((a) => (
                <TableCell key={a.periodEnd} className={styles.number}>
                  {a.liquidation
                    ? t("liquidation")
                    : a.auditOptedOut
                      ? t("notAudited")
                      : a.audited
                        ? t("audited")
                        : "–"}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

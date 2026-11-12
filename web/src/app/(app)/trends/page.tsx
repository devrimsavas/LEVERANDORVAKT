import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  Alert,
  Button,
  Field,
  Heading,
  Label,
  Paragraph,
  Select,
  SelectOption,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@digdir/designsystemet-react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
} from "@navikt/aksel-icons";
import {
  addMonths,
  currentMonth,
  getIndustryBreakdown,
  getIndustryDivisions,
  getMunicipalities,
  getRegistrationTrend,
  type TrendFilters,
} from "@/lib/trends";
import { orgFormName } from "@/lib/orgForm";
import { RegistrationsChart } from "@/components/trends/RegistrationsChart";
import styles from "@/components/trends/trends.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.nav");
  return { title: `${t("trends")} – Leverandørvakt` };
}

const PERIODS = [12, 24, 36] as const;
const FORMS = ["AS", "ENK", "NUF", "ASA", "DA", "ANS", "SA", "STI", "FLI"];

function pick(
  value: string | string[] | undefined,
  valid: (v: string) => boolean,
) {
  return typeof value === "string" && valid(value) ? value : null;
}

// New companies over time, filtered by municipality, main industry and
// organization form. The filters are a plain GET form, so a view can be
// shared or bookmarked by its URL.
export default async function TrendsPage({
  searchParams,
}: PageProps<"/trends">) {
  const t = await getTranslations("trends");
  const forms = await getTranslations("orgForms");
  const format = await getFormatter();
  const query = await searchParams;

  const filters: TrendFilters = {
    municipality: pick(query.municipality, (v) => /^\d{4}$/.test(v)),
    industry: pick(query.industry, (v) => /^\d{2}$/.test(v)),
    form: pick(query.form, (v) => FORMS.includes(v)),
  };
  const months = Number(
    pick(query.months, (v) => PERIODS.map(String).includes(v)) ?? 12,
  );
  const to = currentMonth();
  const from = addMonths(to, -(months - 1));

  const [trend, breakdown, municipalities, divisions] = await Promise.all([
    getRegistrationTrend(filters, from, to),
    getIndustryBreakdown(filters, from, to),
    getMunicipalities(),
    getIndustryDivisions(),
  ]);

  const municipalityName = municipalities.find(
    (m) => m.code === filters.municipality,
  )?.name;

  return (
    <div className={`container ${styles.page}`}>
      <div>
        <Heading level={1} data-size="lg">
          {t("title")}
        </Heading>
        <Paragraph className={styles.lead}>{t("lead")}</Paragraph>
      </div>

      <form method="get" action="/trends" className={styles.filters}>
        <Field>
          <Label>{t("filters.municipality")}</Label>
          <Select name="municipality" defaultValue={filters.municipality ?? ""}>
            <SelectOption value="">{t("filters.allNorway")}</SelectOption>
            {municipalities.map((m) => (
              <SelectOption key={m.code} value={m.code}>
                {m.name}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>{t("filters.industry")}</Label>
          <Select name="industry" defaultValue={filters.industry ?? ""}>
            <SelectOption value="">{t("filters.allIndustries")}</SelectOption>
            {divisions.map((d) => (
              <SelectOption key={d.code} value={d.code}>
                {d.code} {d.name}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>{t("filters.form")}</Label>
          <Select name="form" defaultValue={filters.form ?? ""}>
            <SelectOption value="">{t("filters.allForms")}</SelectOption>
            {FORMS.map((code) => (
              <SelectOption key={code} value={code}>
                {code} – {orgFormName(forms, code) ?? code}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>{t("filters.period")}</Label>
          <Select name="months" defaultValue={String(months)}>
            {PERIODS.map((p) => (
              <SelectOption key={p} value={String(p)}>
                {t("filters.months", { count: p })}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <Button type="submit" className={styles.apply}>
          {t("filters.apply")}
        </Button>
      </form>

      {trend.status !== "ok" ? (
        <Alert data-color="warning">{t("unavailable")}</Alert>
      ) : (
        <>
          <section className={styles.summary} aria-label={t("summaryLabel")}>
            <div>
              <span className={styles.summaryLabel}>
                {t("summary.total", {
                  months,
                  place: municipalityName ?? t("filters.allNorway"),
                })}
              </span>
              <span className={styles.summaryValue}>
                {format.number(trend.data.total)}
              </span>
            </div>
            <div>
              <span className={styles.summaryLabel}>
                {t("summary.previous")}
              </span>
              <span className={styles.summaryValue}>
                {format.number(trend.data.previousYearTotal)}
              </span>
            </div>
            <div>
              <span className={styles.summaryLabel}>{t("summary.change")}</span>
              <span className={styles.summaryValue}>
                {trend.data.changePercent === null ? (
                  "–"
                ) : (
                  <span className={styles.change}>
                    {trend.data.changePercent > 0 ? (
                      <ArrowUpIcon aria-hidden />
                    ) : trend.data.changePercent < 0 ? (
                      <ArrowDownIcon aria-hidden />
                    ) : (
                      <ArrowRightIcon aria-hidden />
                    )}
                    {format.number(trend.data.changePercent / 100, {
                      style: "percent",
                      maximumFractionDigits: 1,
                      signDisplay: "exceptZero",
                    })}
                  </span>
                )}
              </span>
            </div>
          </section>

          <RegistrationsChart months={trend.data.months} />
          <Paragraph data-size="sm" className={styles.note}>
            {t("partialNote")}
          </Paragraph>

          <details className={styles.tableView}>
            <summary>{t("showTable")}</summary>
            <div className={styles.tableWrap}>
              <Table zebra data-size="sm">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t("table.month")}</TableHeaderCell>
                    <TableHeaderCell className={styles.number}>
                      {t("chart.current")}
                    </TableHeaderCell>
                    <TableHeaderCell className={styles.number}>
                      {t("chart.previous")}
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {trend.data.months.map((m) => (
                    <TableRow key={m.month}>
                      <TableHeaderCell scope="row">
                        {format.dateTime(new Date(`${m.month}-01T00:00:00Z`), {
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                        {m.partial && ` (${t("table.partial")})`}
                      </TableHeaderCell>
                      <TableCell className={styles.number}>
                        {format.number(m.count)}
                      </TableCell>
                      <TableCell className={styles.number}>
                        {format.number(m.previousYear)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        </>
      )}

      <section className={styles.card} aria-labelledby="industries">
        <Heading id="industries" level={2} data-size="sm">
          {t("industries.title")}
        </Heading>
        {breakdown.status !== "ok" ? (
          <Alert data-color="warning">{t("unavailable")}</Alert>
        ) : breakdown.data.limitations.some(
            (l) => l.code === "TOO_MANY_REGISTRATIONS",
          ) ? (
          <Alert data-color="info">
            {t("industries.tooMany", {
              total: format.number(
                Number(breakdown.data.limitations[0]!.params.total),
              ),
              max: format.number(
                Number(breakdown.data.limitations[0]!.params.max),
              ),
            })}
          </Alert>
        ) : breakdown.data.total === 0 ? (
          <Paragraph>{t("industries.none")}</Paragraph>
        ) : (
          <>
            <ol className={styles.bars}>
              {breakdown.data.industries.map((industry) => {
                const max = breakdown.data.industries[0]!.count;
                return (
                  <li key={industry.code} className={styles.barRow}>
                    <span className={styles.barName}>
                      <span className={styles.code}>{industry.code}</span>{" "}
                      {industry.description}
                    </span>
                    <span className={styles.barTrack} aria-hidden>
                      <span
                        className={styles.barFill}
                        style={{ width: `${(industry.count / max) * 100}%` }}
                      />
                    </span>
                    <span className={styles.barValue}>
                      {format.number(industry.count)}
                      <span className={styles.barShare}>
                        {format.number(industry.count / breakdown.data.total, {
                          style: "percent",
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <Paragraph data-size="sm" className={styles.note}>
              {t("industries.rest", {
                other: format.number(breakdown.data.otherCount),
                unspecified: format.number(breakdown.data.unspecifiedCount),
                total: format.number(breakdown.data.total),
              })}
              {breakdown.data.limitations.some(
                (l) => l.code === "INDUSTRY_NAMES_UNAVAILABLE",
              ) && ` ${t("industries.namesUnavailable")}`}
            </Paragraph>
          </>
        )}
      </section>

      <Paragraph data-size="sm" className={styles.note}>
        {t("source")}
      </Paragraph>
    </div>
  );
}

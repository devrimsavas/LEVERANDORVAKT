import { Op } from "sequelize";
import { TrendCache } from "../models/TrendCache.js";
import {
  countRegistrations,
  listRegisteredIndustries,
} from "./brregService.js";
import { fetchMunicipalities } from "./kartverketService.js";
import { mapWithLimit } from "../utils/concurrency.js";
import type {
  IndustryBreakdown,
  IndustryCount,
  MonthCount,
  Municipality,
  RegistrationFilters,
  RegistrationTrend,
} from "../types/trends.js";

// How long cached answers are kept
const HOUR_MS = 60 * 60 * 1000;
const PAST_MONTH_TTL = 30 * 24 * HOUR_MS; // past months hardly change
const CURRENT_MONTH_TTL = 6 * HOUR_MS; // the current month still grows
const MUNICIPALITIES_TTL = 24 * HOUR_MS;

export const MAX_MONTHS = 36;
// Industry breakdowns download every company; above this it is too slow
export const MAX_BREAKDOWN_REGISTRATIONS = 5000;
const CONCURRENT_REQUESTS = 5;
const TOP_INDUSTRIES = 10;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MUNICIPALITY_PATTERN = /^\d{4}$/;
// "55", "55.1", "55.10" or "55.100"
const INDUSTRY_PATTERN = /^\d{2}(\.\d{1,3})?$/;
const FORM_PATTERN = /^[A-Z]{2,4}$/;

export class TrendInputError extends Error {}

export interface TrendParams {
  filters: RegistrationFilters;
  from: string;
  to: string;
}

// ---- Months ----

function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function addMonths(month: string, count: number): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return monthOf(new Date(Date.UTC(year, m - 1 + count, 1)));
}

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) {
    months.push(month);
  }
  return months;
}

// First and last day of a month, as Brreg expects them
function monthDates(month: string): { first: string; last: string } {
  const lastDay = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  );
  return { first: `${month}-01`, last: lastDay.toISOString().slice(0, 10) };
}

// ---- Input ----

function optional(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

// Checks the query parameters of a trend request. Without from and to,
// the last 12 months up to the current one are used.
export function parseTrendParams(
  query: Record<string, unknown>,
  now = new Date(),
): TrendParams {
  const current = monthOf(now);
  const to = optional(query.to) ?? current;
  const from = optional(query.from) ?? addMonths(to, -11);
  const municipality = optional(query.municipality);
  const industry = optional(query.industry);
  const form = optional(query.form)?.toUpperCase() ?? null;

  if (!MONTH_PATTERN.test(from) || !MONTH_PATTERN.test(to)) {
    throw new TrendInputError("from and to must be months like 2026-03");
  }
  if (from > to) {
    throw new TrendInputError("from must not be after to");
  }
  if (to > current) {
    throw new TrendInputError("to must not be in the future");
  }
  if (monthsBetween(from, to).length > MAX_MONTHS) {
    throw new TrendInputError(`At most ${MAX_MONTHS} months at a time`);
  }
  if (municipality && !MUNICIPALITY_PATTERN.test(municipality)) {
    throw new TrendInputError(
      "municipality must be a 4-digit municipality number",
    );
  }
  if (industry && !INDUSTRY_PATTERN.test(industry)) {
    throw new TrendInputError(
      'industry must be an industry code like "55" or "55.100"',
    );
  }
  if (form && !FORM_PATTERN.test(form)) {
    throw new TrendInputError('form must be an organization form like "AS"');
  }

  return { filters: { municipality, industry, form }, from, to };
}

// ---- Cache ----

// Returns the cached value for key, or fetches it and keeps it for ttlMs
async function cached<T>(
  key: string,
  ttlMs: number,
  fetchValue: () => Promise<T>,
): Promise<T> {
  const hit = await TrendCache.findOne({
    where: { key, expiresAt: { [Op.gt]: new Date() } },
  });
  if (hit) {
    return hit.value as T;
  }

  const value = await fetchValue();
  await TrendCache.upsert({
    key,
    value,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return value;
}

function filtersKey(filters: RegistrationFilters): string {
  return [filters.municipality, filters.industry, filters.form]
    .map((v) => v ?? "")
    .join("|");
}

function ttlFor(month: string, now: Date): number {
  return month < monthOf(now) ? PAST_MONTH_TTL : CURRENT_MONTH_TTL;
}

// Registrations in a month, or only up to a given day of it
function countForMonth(
  filters: RegistrationFilters,
  month: string,
  now: Date,
  untilDay: number | null = null,
): Promise<number> {
  const { first, last } = monthDates(month);
  // A day after the end of the month (e.g. the 30th in February) means
  // the whole month
  const end =
    untilDay === null || untilDay >= Number(last.slice(8))
      ? last
      : `${month}-${String(untilDay).padStart(2, "0")}`;
  const key =
    end === last
      ? `count:${filtersKey(filters)}|${month}`
      : `count:${filtersKey(filters)}|${month}|until:${end}`;

  return cached(key, ttlFor(month, now), () =>
    countRegistrations(filters, first, end),
  );
}

// ---- Trends ----

// New registrations per month, each compared with the same month a year
// earlier, so seasonal patterns do not look like growth or decline
export async function getRegistrationTrend(
  { filters, from, to }: TrendParams,
  now = new Date(),
): Promise<RegistrationTrend> {
  const months = monthsBetween(from, to);
  const current = monthOf(now);

  // The current month is not over: a year earlier only the same days are
  // counted (1-11 November against 1-11 November), or the comparison would
  // set a part of a month against a whole one
  const today = now.getUTCDate();
  const counts = await mapWithLimit(
    months.flatMap((month) => [
      { month, untilDay: null },
      {
        month: addMonths(month, -12),
        untilDay: month === current ? today : null,
      },
    ]),
    CONCURRENT_REQUESTS,
    ({ month, untilDay }) => countForMonth(filters, month, now, untilDay),
  );

  const series: MonthCount[] = months.map((month, i) => ({
    month,
    count: counts[i * 2]!,
    previousYear: counts[i * 2 + 1]!,
    partial: month === current,
  }));

  const total = series.reduce((sum, m) => sum + m.count, 0);
  const previousYearTotal = series.reduce((sum, m) => sum + m.previousYear, 0);

  return {
    filters,
    from,
    to,
    months: series,
    total,
    previousYearTotal,
    changePercent:
      previousYearTotal === 0
        ? null
        : Math.round(((total - previousYearTotal) / previousYearTotal) * 1000) /
          10,
  };
}

// The industries new companies were registered in, most common first.
// Brreg cannot count by industry, so the companies are downloaded month
// by month and counted here; very large periods are refused with a
// limitation instead of taking minutes.
export async function getIndustryBreakdown(
  { filters, from, to }: TrendParams,
  now = new Date(),
): Promise<IndustryBreakdown> {
  const months = monthsBetween(from, to);
  const counts = await mapWithLimit(months, CONCURRENT_REQUESTS, (month) =>
    countForMonth(filters, month, now),
  );
  const total = counts.reduce((sum, c) => sum + c, 0);
  const result = { filters, from, to, total };

  if (total > MAX_BREAKDOWN_REGISTRATIONS) {
    return {
      ...result,
      industries: [],
      otherCount: 0,
      limitations: [
        `${total} registrations are too many to break down by industry (at most ${MAX_BREAKDOWN_REGISTRATIONS}). Choose a shorter period, a municipality or an industry.`,
      ],
    };
  }

  const industries = await cached(
    `industries:${filtersKey(filters)}|${from}|${to}`,
    ttlFor(to, now),
    async () => {
      const perMonth = await mapWithLimit(months, 2, (month) => {
        const { first, last } = monthDates(month);
        return listRegisteredIndustries(filters, first, last);
      });

      const byCode = new Map<string, IndustryCount>();
      for (const industry of perMonth.flat()) {
        const key = industry?.code ?? "";
        const entry = byCode.get(key) ?? {
          code: industry?.code ?? null,
          description: industry?.description ?? "No industry code registered",
          count: 0,
        };
        entry.count += 1;
        byCode.set(key, entry);
      }
      return [...byCode.values()].sort(
        (a, b) =>
          b.count - a.count || (a.code ?? "").localeCompare(b.code ?? ""),
      );
    },
  );

  const top = industries.slice(0, TOP_INDUSTRIES);
  return {
    ...result,
    industries: top,
    otherCount: industries
      .slice(TOP_INDUSTRIES)
      .reduce((sum, i) => sum + i.count, 0),
    limitations: [],
  };
}

// All municipalities, for choosing one in a list
export function getMunicipalities(): Promise<Municipality[]> {
  return cached("municipalities", MUNICIPALITIES_TTL, fetchMunicipalities);
}

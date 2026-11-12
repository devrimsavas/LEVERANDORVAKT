import "server-only";
import { apiFetch } from "./api";
import type { Loaded } from "./companies";

// Regional trends from the API's public /api/trends endpoints

export interface TrendFilters {
  municipality: string | null;
  industry: string | null;
  form: string | null;
}

export interface MonthCount {
  month: string;
  count: number;
  previousYear: number;
  partial: boolean;
}

export interface RegistrationTrend {
  months: MonthCount[];
  total: number;
  previousYearTotal: number;
  changePercent: number | null;
}

export interface IndustryCount {
  code: string;
  description: string;
  count: number;
}

export interface TrendLimitation {
  code: string;
  params: Record<string, string | number | null>;
}

export interface IndustryBreakdown {
  total: number;
  industries: IndustryCount[];
  otherCount: number;
  unspecifiedCount: number;
  limitations: TrendLimitation[];
}

export interface Option {
  code: string;
  name: string;
}

function query(filters: TrendFilters, from: string, to: string): string {
  const params = new URLSearchParams({ from, to });
  if (filters.municipality) params.set("municipality", filters.municipality);
  if (filters.industry) params.set("industry", filters.industry);
  if (filters.form) params.set("form", filters.form);
  return params.toString();
}

async function load<T>(path: string): Promise<Loaded<T>> {
  const result = await apiFetch<T>(path, { auth: false });
  return result.ok
    ? { status: "ok", data: result.data }
    : { status: "unavailable" };
}

export function getRegistrationTrend(
  filters: TrendFilters,
  from: string,
  to: string,
) {
  return load<RegistrationTrend>(
    `/api/trends/registrations?${query(filters, from, to)}`,
  );
}

export function getIndustryBreakdown(
  filters: TrendFilters,
  from: string,
  to: string,
) {
  return load<IndustryBreakdown>(
    `/api/trends/industries?${query(filters, from, to)}`,
  );
}

export async function getMunicipalities(): Promise<Option[]> {
  const result = await load<{ number: string; name: string }[]>(
    "/api/trends/municipalities",
  );
  return result.status === "ok"
    ? result.data.map((m) => ({ code: m.number, name: m.name }))
    : [];
}

export async function getIndustryDivisions(): Promise<Option[]> {
  const result = await load<Option[]>("/api/trends/industry-divisions");
  return result.status === "ok" ? result.data : [];
}

// "2026-11" -> "2025-12" for months = -11
export function addMonths(month: string, count: number): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, m - 1 + count, 1)).toISOString().slice(0, 7);
}

export function currentMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

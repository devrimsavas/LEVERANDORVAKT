// Regional trends: new companies registered over time, from the
// Central Coordinating Register's search.

// Optional filters; all of them can be combined
export interface RegistrationFilters {
  // 4-digit municipality number, e.g. "5601" (Alta)
  municipality: string | null;
  // Industry code or the start of one: "55" (accommodation), "55.1", "55.100"
  industry: string | null;
  // Organization form, e.g. "AS"
  form: string | null;
}

export interface MonthCount {
  month: string; // "2026-03"
  count: number;
  // The same month one year earlier, for a fair comparison of seasons.
  // For the current month only the same days are counted (e.g. 1-11 November).
  previousYear: number;
  // The month is not over yet
  partial: boolean;
}

export interface RegistrationTrend {
  filters: RegistrationFilters;
  from: string;
  to: string;
  months: MonthCount[];
  total: number;
  previousYearTotal: number;
  // Change against the same months a year earlier, in percent; null if
  // there were none a year earlier
  changePercent: number | null;
}

// "division": by main industry, the first two digits of the code (62 = IT),
// "detailed": by the full code (62.100 = computer programming)
export type IndustryLevel = "division" | "detailed";

export interface IndustryCount {
  code: string;
  description: string;
  count: number;
}

export interface IndustryBreakdown {
  filters: RegistrationFilters;
  from: string;
  to: string;
  level: IndustryLevel;
  total: number;
  // The ten most common industries, most first
  industries: IndustryCount[];
  // Registrations in the remaining industries
  otherCount: number;
  // Registrations without an industry ("00.000 Uoppgitt" or none at all)
  unspecifiedCount: number;
  limitations: string[];
}

export interface Municipality {
  number: string;
  name: string;
}

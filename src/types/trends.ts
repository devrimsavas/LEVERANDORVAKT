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
  // The same month one year earlier, for a fair comparison of seasons
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

export interface IndustryCount {
  code: string | null; // null: no industry code registered
  description: string;
  count: number;
}

export interface IndustryBreakdown {
  filters: RegistrationFilters;
  from: string;
  to: string;
  total: number;
  // The ten most common industries, most first
  industries: IndustryCount[];
  // Registrations in the remaining industries
  otherCount: number;
  limitations: string[];
}

export interface Municipality {
  number: string;
  name: string;
}

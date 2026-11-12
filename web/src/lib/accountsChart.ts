// Shared by the accounts table (server) and the chart (client). Values
// exported from a "use client" file are not available on the server, so
// they live here.
export const CHART_METRICS = ["revenue", "netProfit", "equity"] as const;
export type ChartMetric = (typeof CHART_METRICS)[number];

export interface ChartYear {
  year: number;
  values: Record<ChartMetric, number | null>;
}

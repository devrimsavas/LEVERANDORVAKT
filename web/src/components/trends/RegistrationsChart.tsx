"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./trends.module.css";

interface Point {
  month: string;
  count: number;
  previousYear: number;
  partial: boolean;
}

// New companies per month, with the same months a year earlier as a dashed
// line. Two series, so there is a legend; the lines also differ by dash,
// not only by color.
export function RegistrationsChart({ months }: { months: Point[] }) {
  const t = useTranslations("trends.chart");
  const format = useFormatter();
  const label = (month: string) =>
    format.dateTime(new Date(`${month}-01T00:00:00Z`), {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
  const longLabel = (month: string) =>
    format.dateTime(new Date(`${month}-01T00:00:00Z`), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartHead}>
        <span className={styles.chartTitle}>{t("title")}</span>
        <span className={styles.legend}>
          <span className={styles.legendItem}>
            <span
              className={styles.legendLine}
              data-series="current"
              aria-hidden
            />
            {t("current")}
          </span>
          <span className={styles.legendItem}>
            <span
              className={styles.legendLine}
              data-series="previous"
              aria-hidden
            />
            {t("previous")}
          </span>
        </span>
      </figcaption>
      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={months}
            margin={{ top: 12, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--ds-color-neutral-border-subtle)"
            />
            <XAxis
              dataKey="month"
              tickFormatter={label}
              tickLine={false}
              axisLine={{ stroke: "var(--ds-color-neutral-border-default)" }}
              tick={{
                fill: "var(--ds-color-neutral-text-subtle)",
                fontSize: 13,
              }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              width={44}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{
                fill: "var(--ds-color-neutral-text-subtle)",
                fontSize: 13,
              }}
            />
            <Tooltip
              cursor={{
                stroke: "var(--ds-color-neutral-border-strong)",
                strokeWidth: 1,
              }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as Point | undefined;
                if (!active || !point) return null;
                return (
                  <div className={styles.tooltip}>
                    <span className={styles.tooltipTitle}>
                      {longLabel(point.month)}
                    </span>
                    <span className={styles.tooltipRow}>
                      <span
                        className={styles.legendLine}
                        data-series="current"
                        aria-hidden
                      />
                      <strong>{format.number(point.count)}</strong>{" "}
                      {t("current")}
                    </span>
                    <span className={styles.tooltipRow}>
                      <span
                        className={styles.legendLine}
                        data-series="previous"
                        aria-hidden
                      />
                      <strong>{format.number(point.previousYear)}</strong>{" "}
                      {t("previous")}
                    </span>
                    {point.partial && (
                      <span className={styles.tooltipNote}>{t("partial")}</span>
                    )}
                  </div>
                );
              }}
            />
            <Line
              dataKey="previousYear"
              stroke="var(--chart-series-2)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{
                r: 4,
                strokeWidth: 2,
                stroke: "var(--ds-color-neutral-background-default)",
              }}
              isAnimationActive={false}
            />
            <Line
              dataKey="count"
              stroke="var(--chart-series-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                strokeWidth: 2,
                stroke: "var(--ds-color-neutral-background-default)",
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

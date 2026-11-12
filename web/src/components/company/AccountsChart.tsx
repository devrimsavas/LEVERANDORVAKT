"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@digdir/designsystemet-react";
import {
  CHART_METRICS,
  type ChartMetric,
  type ChartYear,
} from "@/lib/accountsChart";
import styles from "./company.module.css";

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number | [number, number];
}

// A column with a 4px rounded data-end and a square end at the zero line.
// For a negative value the data-end is at the bottom.
function RoundedColumn({ x = 0, y = 0, width = 0, height = 0 }: BarShapeProps) {
  const top = Math.min(y, y + height);
  const h = Math.abs(height);
  if (h === 0 || width === 0) return null;
  const r = Math.min(4, h, width / 2);
  const negative = height < 0;
  const path = negative
    ? `M${x},${top} h${width} v${h - r} q0,${r} -${r},${r} h-${width - 2 * r} q-${r},0 -${r},-${r} Z`
    : `M${x},${top + h} v-${h - r} q0,-${r} ${r},-${r} h${width - 2 * r} q${r},0 ${r},${r} v${h - r} Z`;
  return <path d={path} fill="var(--ds-color-accent-base-default)" />;
}

// Round axis steps (1, 2 or 5 times a power of ten) covering zero and every
// value, e.g. -400K, -300K, ..., 0
function niceTicks(values: number[]): number[] {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  if (low === high) return [0];
  const rough = (high - low) / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const ticks: number[] = [];
  for (let t = Math.floor(low / step) * step; t <= high + step / 2; t += step) {
    ticks.push(Math.round(t));
  }
  if (ticks[ticks.length - 1]! < high)
    ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

// Five years of one key figure as columns, chosen with the toggle above.
// The table below the chart has every number, so the chart only labels the
// latest year and shows the rest on hover or keyboard focus.
export function AccountsChart({
  years,
  currency,
}: {
  years: ChartYear[];
  currency: string | null;
}) {
  const t = useTranslations("company.accounts");
  const format = useFormatter();
  // Start with the first figure the company actually reports
  const [metric, setMetric] = useState<ChartMetric>(
    () =>
      CHART_METRICS.find((m) => years.some((y) => y.values[m] !== null)) ??
      "revenue",
  );

  const data = years.map((y) => ({
    year: String(y.year),
    value: y.values[metric],
  }));
  const hasNegative = data.some((d) => d.value !== null && d.value < 0);
  const lastIndex = data.length - 1;
  const ticks = niceTicks(
    data.flatMap((d) => (d.value === null ? [] : [d.value])),
  );

  const full = (value: number) =>
    currency
      ? format.number(value, {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        })
      : format.number(value, { maximumFractionDigits: 0 });
  const compact = (value: number) =>
    format.number(value, { notation: "compact", maximumFractionDigits: 1 });

  return (
    <figure className={styles.chart}>
      <div className={styles.chartHead}>
        <figcaption className={styles.chartTitle}>
          {t("chart.title", { figure: t(`rows.${metric}`) })}
          {currency && <span className={styles.chartUnit}> ({currency})</span>}
        </figcaption>
        <ToggleGroup
          value={metric}
          onChange={(value) => setMetric(value as ChartMetric)}
          data-size="sm"
          aria-label={t("chart.choose")}
        >
          {CHART_METRICS.map((m) => (
            <ToggleGroupItem key={m} value={m}>
              {t(`rows.${m}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {data.every((d) => d.value === null) ? (
        <p className={styles.chartEmpty}>
          {t("chart.noData", { figure: t(`rows.${metric}`) })}
        </p>
      ) : (
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={data}
              margin={{ top: 24, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--ds-color-neutral-border-subtle)"
              />
              <XAxis
                dataKey="year"
                tickLine={false}
                axisLine={false}
                tick={{
                  fill: "var(--ds-color-neutral-text-subtle)",
                  fontSize: 13,
                }}
              />
              {/* Columns grow from zero, so zero is always on the axis */}
              <YAxis
                ticks={ticks}
                domain={[ticks[0] ?? 0, ticks[ticks.length - 1] ?? 0]}
                width={56}
                tickLine={false}
                axisLine={false}
                tickFormatter={compact}
                tick={{
                  fill: "var(--ds-color-neutral-text-subtle)",
                  fontSize: 13,
                }}
              />
              {hasNegative && (
                <ReferenceLine
                  y={0}
                  stroke="var(--ds-color-neutral-border-strong)"
                />
              )}
              <Tooltip
                cursor={{ fill: "var(--ds-color-neutral-background-tinted)" }}
                content={({ active, payload, label }) => {
                  const value = payload?.[0]?.value;
                  if (!active || typeof value !== "number") return null;
                  return (
                    <div className={styles.tooltip}>
                      <strong>{full(value)}</strong>
                      <span>
                        {t(`rows.${metric}`)} {label}
                      </span>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="value"
                maxBarSize={24}
                shape={RoundedColumn}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="value"
                  content={({ x, y, width, height, value, index }) =>
                    index === lastIndex && typeof value === "number" ? (
                      <text
                        x={Number(x) + Number(width) / 2}
                        y={
                          value < 0
                            ? Math.max(Number(y), Number(y) + Number(height)) +
                              16
                            : Math.min(Number(y), Number(y) + Number(height)) -
                              8
                        }
                        textAnchor="middle"
                        fontSize={13}
                        fontWeight={600}
                        fill="var(--ds-color-neutral-text-default)"
                      >
                        {compact(value)}
                      </text>
                    ) : null
                  }
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

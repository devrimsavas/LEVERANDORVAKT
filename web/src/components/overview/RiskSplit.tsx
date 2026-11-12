import NextLink from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Heading, Link } from "@digdir/designsystemet-react";
import type { RiskLevel, WatchlistRow } from "@/lib/companyTypes";
import styles from "./overview.module.css";

export type RiskPart = RiskLevel | "notAssessed";
const PARTS: RiskPart[] = ["high", "medium", "low", "notAssessed"];

// Counts per risk level for the companies in a watchlist
export function countRiskLevels(
  rows: WatchlistRow[],
): Record<RiskPart, number> {
  const counts = { high: 0, medium: 0, low: 0, notAssessed: 0 };
  for (const row of rows) counts[row.risk.level ?? "notAssessed"] += 1;
  return counts;
}

interface RiskSplitProps {
  id: string;
  title: string;
  counts: Record<RiskPart, number>;
  link?: { href: string; text: string };
}

// How companies split across risk levels: a thin segmented bar above a
// list that gives each level's name, count and share. The list carries
// the figures, so the bar has no text, and the level names mean the
// colors are never the only way to read it. Used on the overview (your
// watchlist) and the admin page (every stored company).
export async function RiskSplit({
  id,
  title,
  counts: byPart,
  link,
}: RiskSplitProps) {
  const t = await getTranslations("overview.risk");
  const level = await getTranslations("risk.level");
  const format = await getFormatter();

  const counts = PARTS.map((part) => ({ part, count: byPart[part] }));
  const total = counts.reduce((sum, { count }) => sum + count, 0);

  return (
    <section className={styles.card} aria-labelledby={id}>
      <Heading id={id} level={2} data-size="xs">
        {title}
      </Heading>
      <div className={styles.bar} aria-hidden="true">
        {counts
          .filter(({ count }) => count > 0)
          .map(({ part, count }) => (
            <span
              key={part}
              className={styles.segment}
              data-level={part}
              style={{ flexGrow: count }}
            />
          ))}
      </div>
      <ul className={styles.legend}>
        {counts.map(({ part, count }) => (
          <li key={part} data-empty={count === 0 || undefined}>
            <span
              className={styles.swatch}
              data-level={part}
              aria-hidden="true"
            />
            <span className={styles.legendName}>{level(part)}</span>
            <span className={styles.legendCount}>
              {t("companies", { count })}
            </span>
            <span className={styles.legendShare}>
              {format.number(total ? count / total : 0, {
                style: "percent",
                maximumFractionDigits: 0,
              })}
            </span>
          </li>
        ))}
      </ul>
      {link && (
        <Link asChild data-size="sm">
          <NextLink href={link.href}>{link.text}</NextLink>
        </Link>
      )}
    </section>
  );
}

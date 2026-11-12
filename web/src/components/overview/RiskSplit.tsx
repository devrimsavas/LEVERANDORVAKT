import NextLink from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Heading, Link } from "@digdir/designsystemet-react";
import type { RiskLevel, WatchlistRow } from "@/lib/companyTypes";
import styles from "./overview.module.css";

type Part = RiskLevel | "notAssessed";
const PARTS: Part[] = ["high", "medium", "low", "notAssessed"];

// How the followed companies split across risk levels: a thin segmented bar
// above a list that gives each level's name, count and share. The list
// carries the figures, so the bar has no text, and the level names mean
// the colors are never the only way to read it.
export async function RiskSplit({ rows }: { rows: WatchlistRow[] }) {
  const t = await getTranslations("overview.risk");
  const level = await getTranslations("risk.level");
  const format = await getFormatter();

  const counts = PARTS.map((part) => ({
    part,
    count: rows.filter((row) => (row.risk.level ?? "notAssessed") === part)
      .length,
  }));
  const total = rows.length;

  return (
    <section className={styles.card} aria-labelledby="risk-split">
      <Heading id="risk-split" level={2} data-size="xs">
        {t("title")}
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
      <Link asChild data-size="sm">
        <NextLink href="/watchlist?sort=risk">{t("link")}</NextLink>
      </Link>
    </section>
  );
}

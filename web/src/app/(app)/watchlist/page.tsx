import type { Metadata } from "next";
import NextLink from "next/link";
import { getFormatter, getNow, getTranslations } from "next-intl/server";
import {
  Alert,
  Button,
  Heading,
  Paragraph,
} from "@digdir/designsystemet-react";
import { MagnifyingGlassIcon } from "@navikt/aksel-icons";
import { getWatchlist, type WatchlistSort } from "@/lib/companies";
import { formatOrgNumber } from "@/lib/orgNumber";
import type { RiskLevel } from "@/lib/companyTypes";
import { companyStatuses } from "@/components/company/companyStatus";
import { StatusTags } from "@/components/company/StatusTags";
import { RiskTag } from "@/components/company/RiskTag";
import styles from "./watchlist.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.nav");
  return { title: `${t("watchlist")} – Leverandørvakt` };
}

const SORTS: WatchlistSort[] = ["name", "risk"];
const RISK_ORDER: RiskLevel[] = ["high", "medium", "low"];

export default async function WatchlistPage({
  searchParams,
}: PageProps<"/watchlist">) {
  const t = await getTranslations("watchlist");
  const format = await getFormatter();
  const now = await getNow();
  const { sort: sortParam } = await searchParams;
  const sort: WatchlistSort = sortParam === "risk" ? "risk" : "name";
  const result = await getWatchlist(sort);

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.top}>
        <div>
          <Heading level={1} data-size="lg">
            {t("title")}
          </Heading>
          {result.status === "ok" && result.data.length > 0 && (
            <Paragraph>
              {t("summary", { count: result.data.length })}{" "}
              {RISK_ORDER.map((level) => ({
                level,
                count: result.data.filter((row) => row.risk.level === level)
                  .length,
              }))
                .filter(({ count }) => count > 0)
                .map(({ level, count }) => t(`riskCount.${level}`, { count }))
                .join(", ")}
            </Paragraph>
          )}
        </div>
        <Button asChild variant="secondary">
          <NextLink href="/search">
            <MagnifyingGlassIcon aria-hidden />
            {t("add")}
          </NextLink>
        </Button>
      </div>

      {result.status === "unavailable" && (
        <Alert data-color="warning">{t("unavailable")}</Alert>
      )}

      {result.status === "ok" && result.data.length === 0 && (
        <div className={styles.empty}>
          <Heading level={2} data-size="sm">
            {t("empty.title")}
          </Heading>
          <Paragraph>{t("empty.text")}</Paragraph>
          <Button asChild>
            <NextLink href="/search">{t("empty.button")}</NextLink>
          </Button>
        </div>
      )}

      {result.status === "ok" && result.data.length > 0 && (
        <>
          <nav aria-label={t("sortLabel")} className={styles.sort}>
            <span>{t("sortLabel")}:</span>
            {SORTS.map((key) => (
              <NextLink
                key={key}
                href={key === "name" ? "/watchlist" : `/watchlist?sort=${key}`}
                aria-current={sort === key ? "true" : undefined}
              >
                {t(`sort.${key}`)}
              </NextLink>
            ))}
          </nav>

          <ul className={styles.list}>
            {result.data.map((row) => (
              <li key={row.orgNumber}>
                <NextLink
                  href={`/companies/${row.orgNumber}`}
                  className={styles.row}
                >
                  <span className={styles.company}>
                    <span className={styles.name}>{row.name}</span>
                    <span className={styles.meta}>
                      {formatOrgNumber(row.orgNumber)}
                      {row.company.address?.city &&
                        ` · ${row.company.address.city}`}
                    </span>
                    <StatusTags
                      statuses={companyStatuses(
                        row.company,
                        Boolean(row.deletedFromRegistryAt),
                      )}
                    />
                    {row.note && (
                      <span className={styles.note}>{row.note}</span>
                    )}
                  </span>
                  <span className={styles.cell}>
                    <span className={styles.label}>{t("columns.risk")}</span>
                    <RiskTag level={row.risk.level} />
                  </span>
                  <span className={styles.cell}>
                    <span className={styles.label}>
                      {t("columns.lastChange")}
                    </span>
                    {row.lastChangedAt
                      ? format.relativeTime(new Date(row.lastChangedAt), now)
                      : t("noChanges")}
                  </span>
                  <span className={styles.cell}>
                    <span className={styles.label}>
                      {t("columns.accounts")}
                    </span>
                    {row.accounts.status === "unsupported"
                      ? t("accountsUnsupported")
                      : (row.accounts.latest?.year ?? "–")}
                  </span>
                </NextLink>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

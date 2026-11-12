import NextLink from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  Alert,
  Button,
  Paragraph,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tag,
} from "@digdir/designsystemet-react";
import { changeTitleKey } from "@/lib/changeTitle";
import { getChangeDisplay } from "@/lib/changeDisplay";
import { getCompanyChanges } from "@/lib/companies";
import { SEVERITY_COLOR } from "@/lib/notificationTypes";
import styles from "./company.module.css";

// Detected changes of a followed company, newest first, 20 per page
export async function ChangesTab({
  orgNumber,
  page,
}: {
  orgNumber: string;
  page: number;
}) {
  const t = await getTranslations("company.changes");
  const changes = await getTranslations("changes");
  const severity = await getTranslations("notifications.severity");
  const format = await getFormatter();
  const result = await getCompanyChanges(orgNumber, page);

  if (result.status !== "ok") {
    return <Alert data-color="warning">{t("unavailable")}</Alert>;
  }
  const { items, totalPages } = result.data;
  if (items.length === 0) return <Paragraph>{t("none")}</Paragraph>;

  const display = await getChangeDisplay();
  const pageLink = (target: number) =>
    `/companies/${orgNumber}?tab=changes&page=${target}`;

  return (
    <>
      <div className={styles.tableWrap}>
        <Table zebra>
          <caption className="visually-hidden">{t("caption")}</caption>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t("date")}</TableHeaderCell>
              <TableHeaderCell>{t("change")}</TableHeaderCell>
              <TableHeaderCell>{t("from")}</TableHeaderCell>
              <TableHeaderCell>{t("to")}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item, index) => {
              const key = changeTitleKey(item.field, item.newValue);
              const { before, after } = display(
                item.field,
                item.oldValue,
                item.newValue,
              );
              return (
                <TableRow key={`${item.detectedAt}-${index}`}>
                  <TableCell className={styles.nowrap}>
                    {format.dateTime(new Date(item.detectedAt), {
                      dateStyle: "medium",
                    })}
                  </TableCell>
                  <TableCell>
                    <span className={styles.changeTitle}>
                      <Tag
                        data-color={SEVERITY_COLOR[item.severity]}
                        data-size="sm"
                      >
                        {severity(item.severity)}
                      </Tag>
                      {changes.has(key) ? changes(key) : changes("other")}
                    </span>
                  </TableCell>
                  <TableCell>{before}</TableCell>
                  <TableCell>{after}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <nav aria-label={t("pages")} className={styles.pager}>
          {page > 1 && (
            <Button asChild variant="secondary" data-size="sm">
              <NextLink href={pageLink(page - 1)}>{t("newer")}</NextLink>
            </Button>
          )}
          <span>{t("pageOf", { page, total: totalPages })}</span>
          {page < totalPages && (
            <Button asChild variant="secondary" data-size="sm">
              <NextLink href={pageLink(page + 1)}>{t("older")}</NextLink>
            </Button>
          )}
        </nav>
      )}
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getNow, getTranslations } from "next-intl/server";
import { Alert, Heading, Paragraph } from "@digdir/designsystemet-react";
import { getCompanyPage } from "@/lib/companies";
import { requireUser } from "@/lib/user";
import { formatOrgNumber, parseOrgNumber } from "@/lib/orgNumber";
import { companyStatuses } from "@/components/company/companyStatus";
import { StatusTags } from "@/components/company/StatusTags";
import { OverviewTab } from "@/components/company/OverviewTab";
import { RolesTab } from "@/components/company/RolesTab";
import { AccountsTab } from "@/components/company/AccountsTab";
import { RiskTab } from "@/components/company/RiskTab";
import { ChangesTab } from "@/components/company/ChangesTab";
import { ReportToolbar } from "@/components/report/ReportToolbar";
import styles from "@/components/report/report.module.css";

// The browser names the PDF after the title, so it says what and when
export async function generateMetadata({
  params,
}: PageProps<"/companies/[orgNumber]/report">): Promise<Metadata> {
  const t = await getTranslations("company.report");
  const format = await getFormatter();
  const { orgNumber } = await params;
  const org = parseOrgNumber(orgNumber);
  const page = org ? await getCompanyPage(org) : null;
  const name = page?.status === "ok" ? page.data.company.name : orgNumber;
  const date = format.dateTime(await getNow(), { dateStyle: "short" });
  return { title: `${name} – ${t("title")} ${date}` };
}

// A supplier check of one company on one page, to print or save as PDF
// for the supplier's file: risk first, then the company, its roles,
// accounts and recent changes. The user's private note is left out, since
// the report is made to be passed on.
export default async function CompanyReportPage({
  params,
}: PageProps<"/companies/[orgNumber]/report">) {
  const t = await getTranslations("company");
  const format = await getFormatter();
  const user = await requireUser();
  const { orgNumber } = await params;
  const org = parseOrgNumber(orgNumber);
  if (!org) notFound();

  const result = await getCompanyPage(org);
  if (result.status === "notFound") notFound();
  if (result.status === "unavailable") {
    return (
      <div className={styles.report}>
        <Alert data-color="warning">{t("unavailable")}</Alert>
      </div>
    );
  }

  const { company, roles, watch } = result.data;
  const followed = watch !== null;
  const statuses = companyStatuses(
    company,
    Boolean(watch?.deletedFromRegistryAt),
  );
  const made = format.dateTime(await getNow(), {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <article className={`container ${styles.report}`}>
      <ReportToolbar
        backHref={`/companies/${company.orgNumber}`}
        backText={t("report.back")}
        printText={t("report.print")}
        hint={t("report.printHint")}
      />

      <header className={styles.header}>
        <p className={styles.kicker}>{t("report.title")}</p>
        <Heading level={1} data-size="lg">
          {company.name}
        </Heading>
        <p className={styles.sub}>
          {t("orgNumberShort")} {formatOrgNumber(company.orgNumber)}
          {company.address?.city && ` · ${company.address.city}`}
        </p>
        <StatusTags statuses={statuses} />
        <p className={styles.made}>
          {t("report.made", {
            date: made,
            name: `${user.firstName} ${user.lastName}`,
          })}
        </p>
      </header>

      <section className={styles.section} aria-labelledby="report-risk">
        <Heading id="report-risk" level={2} data-size="sm">
          {t("report.sections.risk")}
        </Heading>
        <RiskTab
          orgNumber={company.orgNumber}
          followed={followed}
          headingLevel={3}
        />
      </section>

      <section className={styles.section} aria-labelledby="report-details">
        <Heading id="report-details" level={2} data-size="sm">
          {t("report.sections.details")}
        </Heading>
        <OverviewTab company={company} watch={watch} />
      </section>

      <section className={styles.section} aria-labelledby="report-roles">
        <Heading id="report-roles" level={2} data-size="sm">
          {t("report.sections.roles")}
        </Heading>
        <RolesTab roles={roles} />
      </section>

      <section className={styles.section} aria-labelledby="report-accounts">
        <Heading id="report-accounts" level={2} data-size="sm">
          {t("report.sections.accounts")}
        </Heading>
        <AccountsTab
          orgNumber={company.orgNumber}
          followed={followed}
          headingLevel={3}
        />
      </section>

      {followed && (
        <section className={styles.section} aria-labelledby="report-changes">
          <Heading id="report-changes" level={2} data-size="sm">
            {t("report.sections.changes")}
          </Heading>
          <ChangesTab orgNumber={company.orgNumber} page={1} paging={false} />
        </section>
      )}

      <footer className={styles.footer}>
        <Paragraph data-size="sm">{t("report.sources")}</Paragraph>
        <Paragraph data-size="sm">{t("report.madeWith")}</Paragraph>
      </footer>
    </article>
  );
}

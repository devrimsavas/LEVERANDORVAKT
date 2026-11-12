import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Heading, Link, Paragraph } from "@digdir/designsystemet-react";
import { getCompanyPage } from "@/lib/companies";
import { formatOrgNumber, parseOrgNumber } from "@/lib/orgNumber";
import { companyStatuses } from "@/components/company/companyStatus";
import { StatusTags } from "@/components/company/StatusTags";
import { FollowControls } from "@/components/company/FollowControls";
import { NoteEditor } from "@/components/company/NoteEditor";
import { OverviewTab } from "@/components/company/OverviewTab";
import { RolesTab } from "@/components/company/RolesTab";
import { ChangesTab } from "@/components/company/ChangesTab";
import styles from "@/components/company/company.module.css";

const TABS = ["overview", "roles", "changes"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({
  params,
}: PageProps<"/companies/[orgNumber]">): Promise<Metadata> {
  const { orgNumber } = await params;
  const org = parseOrgNumber(orgNumber);
  const page = org ? await getCompanyPage(org) : null;
  const name = page?.status === "ok" ? page.data.company.name : orgNumber;
  return { title: `${name} – Leverandørvakt` };
}

export default async function CompanyPage({
  params,
  searchParams,
}: PageProps<"/companies/[orgNumber]">) {
  const t = await getTranslations("company");
  const { orgNumber } = await params;
  const org = parseOrgNumber(orgNumber);
  if (!org) notFound();

  const query = await searchParams;
  const tab: Tab = TABS.includes(query.tab as Tab)
    ? (query.tab as Tab)
    : "overview";
  const page = Math.max(1, Number(query.page) || 1);

  const result = await getCompanyPage(org);

  if (result.status === "notFound") {
    return (
      <div className={`container ${styles.page}`}>
        <Heading level={1} data-size="lg">
          {t("notFound.title")}
        </Heading>
        <Paragraph>
          {t("notFound.text", { orgNumber: formatOrgNumber(org) })}
        </Paragraph>
        <Link asChild>
          <NextLink href="/search">{t("backToSearch")}</NextLink>
        </Link>
      </div>
    );
  }
  if (result.status === "unavailable") {
    return (
      <div className={`container ${styles.page}`}>
        <Alert data-color="warning">{t("unavailable")}</Alert>
      </div>
    );
  }

  const { company, roles, watch } = result.data;
  const statuses = companyStatuses(
    company,
    Boolean(watch?.deletedFromRegistryAt),
  );

  return (
    <div className={`container ${styles.page}`}>
      <Link asChild data-size="sm">
        <NextLink href="/search">{t("backToSearch")}</NextLink>
      </Link>

      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Heading level={1} data-size="lg">
            {company.name}
          </Heading>
          <Paragraph className={styles.sub}>
            {t("orgNumberShort")} {formatOrgNumber(company.orgNumber)}
            {company.address?.city && ` · ${company.address.city}`}
          </Paragraph>
          <StatusTags statuses={statuses} />
        </div>
        <FollowControls
          orgNumber={company.orgNumber}
          name={company.name}
          followed={watch !== null}
        />
      </header>

      {watch && <NoteEditor orgNumber={company.orgNumber} note={watch.note} />}

      <nav aria-label={t("tabsLabel")} className={styles.tabs}>
        {TABS.map((key) => (
          <NextLink
            key={key}
            href={`/companies/${company.orgNumber}${key === "overview" ? "" : `?tab=${key}`}`}
            aria-current={tab === key ? "page" : undefined}
            scroll={false}
          >
            {t(`tabs.${key}`)}
          </NextLink>
        ))}
      </nav>

      <section className={styles.panel} aria-label={t(`tabs.${tab}`)}>
        {tab === "overview" && <OverviewTab company={company} watch={watch} />}
        {tab === "roles" && <RolesTab roles={roles} />}
        {tab === "changes" &&
          (watch ? (
            <ChangesTab orgNumber={company.orgNumber} page={page} />
          ) : (
            <Alert data-color="info">{t("changes.notFollowed")}</Alert>
          ))}
      </section>
    </div>
  );
}

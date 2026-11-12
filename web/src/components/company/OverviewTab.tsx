import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@digdir/designsystemet-react";
import type { Company, WatchlistItem } from "@/lib/companyTypes";
import { formatOrgNumber } from "@/lib/orgNumber";
import { orgFormName } from "@/lib/orgForm";
import styles from "./company.module.css";

function websiteUrl(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export async function OverviewTab({
  company,
  watch,
}: {
  company: Company;
  watch: WatchlistItem | null;
}) {
  const t = await getTranslations("company.overview");
  const forms = await getTranslations("orgForms");
  const format = await getFormatter();
  const date = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "long" });
  const missing = t("unknown");

  const rows: [string, React.ReactNode][] = [
    [t("orgNumber"), formatOrgNumber(company.orgNumber)],
    [
      t("organizationForm"),
      orgFormName(forms, company.organizationForm)
        ? `${orgFormName(forms, company.organizationForm)} (${company.organizationForm})`
        : company.organizationForm,
    ],
    [t("founded"), company.foundedDate ? date(company.foundedDate) : missing],
    [
      t("industry"),
      company.industryCode
        ? `${company.industryDescription ?? ""} (${company.industryCode})`
        : missing,
    ],
    [
      t("employees"),
      company.employees === null ? missing : format.number(company.employees),
    ],
    [
      t("address"),
      company.address
        ? [
            [company.address.postalCode, company.address.city]
              .filter(Boolean)
              .join(" "),
            company.address.municipality &&
              t("municipality", { name: company.address.municipality }),
          ]
            .filter(Boolean)
            .join(", ")
        : missing,
    ],
    [
      t("website"),
      company.website ? (
        <Link
          href={websiteUrl(company.website)}
          target="_blank"
          rel="noreferrer"
        >
          {company.website}
        </Link>
      ) : (
        missing
      ),
    ],
    [
      t("lastAccounts"),
      company.lastAnnualAccountsYear === null
        ? missing
        : String(company.lastAnnualAccountsYear),
    ],
  ];

  if (watch) {
    rows.push(
      [t("followedSince"), date(watch.followedSince)],
      [
        t("lastChecked"),
        format.dateTime(new Date(watch.lastCheckedAt), {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      ],
      [
        t("lastChanged"),
        watch.lastChangedAt ? date(watch.lastChangedAt) : t("noChanges"),
      ],
    );
  }

  return (
    <dl className={styles.details}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.detail}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

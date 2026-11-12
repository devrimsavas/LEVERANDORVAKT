import { getTranslations } from "next-intl/server";
import { Alert, Paragraph } from "@digdir/designsystemet-react";
import type { CompanyRoles } from "@/lib/companyTypes";
import styles from "./company.module.css";

const ROLE_ORDER = [
  "ceo",
  "boardChair",
  "deputyChair",
  "boardMembers",
  "deputyMembers",
  "auditor",
  "accountant",
] as const;

// The people and firms holding key roles. Brreg also has birth dates; the
// API never stores or returns them.
export async function RolesTab({ roles }: { roles: CompanyRoles | null }) {
  const t = await getTranslations("company.roles");

  if (!roles) return <Alert data-color="warning">{t("unavailable")}</Alert>;

  const rows = ROLE_ORDER.map((key) => {
    const value = roles[key];
    const names = Array.isArray(value) ? value : value ? [value] : [];
    return { key, names };
  }).filter((row) => row.names.length > 0);

  if (rows.length === 0) return <Paragraph>{t("none")}</Paragraph>;

  return (
    <dl className={styles.details}>
      {rows.map(({ key, names }) => (
        <div key={key} className={styles.detail}>
          <dt>{t(key)}</dt>
          <dd>
            {names.length === 1 ? (
              names[0]
            ) : (
              <ul className={styles.names}>
                {names.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

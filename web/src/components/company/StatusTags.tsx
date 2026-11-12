import { getTranslations } from "next-intl/server";
import { Tag } from "@digdir/designsystemet-react";
import type { CompanyStatus } from "./companyStatus";

export async function StatusTags({ statuses }: { statuses: CompanyStatus[] }) {
  if (statuses.length === 0) return null;
  const t = await getTranslations("company.status");
  return (
    <span className="tag-row">
      {statuses.map((status) => (
        <Tag key={status} data-color="danger" data-size="sm">
          {t(status)}
        </Tag>
      ))}
    </span>
  );
}

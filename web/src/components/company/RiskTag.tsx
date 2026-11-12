import { getTranslations } from "next-intl/server";
import { Tag } from "@digdir/designsystemet-react";
import { RISK_COLOR, type RiskLevel } from "@/lib/companyTypes";

// A company's risk level; neutral until the first assessment
export async function RiskTag({ level }: { level: RiskLevel | null }) {
  const t = await getTranslations("risk.level");
  return (
    <Tag data-color={level ? RISK_COLOR[level] : "neutral"} data-size="sm">
      {t(level ?? "notAssessed")}
    </Tag>
  );
}

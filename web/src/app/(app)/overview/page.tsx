import { getTranslations } from "next-intl/server";
import { Heading, Paragraph } from "@digdir/designsystemet-react";
import { requireUser } from "@/lib/user";

// Placeholder until the overview (watchlist summary, latest notifications)
// is built
export default async function OverviewPage() {
  const user = await requireUser();
  const t = await getTranslations("overview");

  return (
    <div className="container" style={{ paddingBlock: "var(--ds-size-12)" }}>
      <Heading level={1} data-size="lg">
        {t("welcome", { name: user.firstName })}
      </Heading>
      <Paragraph>{t("placeholder")}</Paragraph>
    </div>
  );
}

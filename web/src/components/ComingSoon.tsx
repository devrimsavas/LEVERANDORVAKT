import { getTranslations } from "next-intl/server";
import { Heading, Paragraph } from "@digdir/designsystemet-react";

// A temporary page body for app pages that are built in later steps
export async function ComingSoon({ title }: { title: string }) {
  const t = await getTranslations("app");
  return (
    <div className="container" style={{ paddingBlock: "var(--ds-size-12)" }}>
      <Heading level={1} data-size="lg">
        {title}
      </Heading>
      <Paragraph>{t("comingSoon")}</Paragraph>
    </div>
  );
}

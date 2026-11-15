import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert, Heading } from "@digdir/designsystemet-react";
import { UnsubscribeForm } from "@/components/UnsubscribeForm";
import styles from "@/components/AuthForms.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("unsubscribe");
  return {
    title: `${t("title")} – Leverandørvakt`,
    // The address holds the user's unsubscribe token
    referrer: "no-referrer",
    robots: { index: false },
  };
}

// The page the "Turn off emails" link in every notification email opens
// (?token=...). It works without logging in.
export default async function UnsubscribePage({
  searchParams,
}: PageProps<"/unsubscribe">) {
  const t = await getTranslations("unsubscribe");
  const { token } = await searchParams;

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.card}>
        <Heading level={1} data-size="md">
          {t("title")}
        </Heading>
        {typeof token === "string" && token ? (
          <UnsubscribeForm token={token} />
        ) : (
          <div className={styles.form}>
            <Alert data-color="danger">{t("errors.linkInvalid")}</Alert>
          </div>
        )}
      </div>
    </div>
  );
}

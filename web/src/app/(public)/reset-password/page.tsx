import type { Metadata } from "next";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert, Heading, Link, Paragraph } from "@digdir/designsystemet-react";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { isResetLinkValid } from "@/lib/passwordReset";
import styles from "@/components/AuthForms.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return {
    title: `${t("title")} – Leverandørvakt`,
    // The address holds the reset token: never send it on to another site
    referrer: "no-referrer",
  };
}

// The page the reset email links to (?token=...). The link is checked
// first, so an old or used one says so before a new password is typed.
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const t = await getTranslations("auth");
  const { token } = await searchParams;
  const valid =
    typeof token === "string" ? await isResetLinkValid(token) : false;

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.card}>
        <Heading level={1} data-size="md">
          {t("reset.title")}
        </Heading>
        {valid === true && typeof token === "string" ? (
          <>
            <Paragraph>{t("reset.lead")}</Paragraph>
            <ResetPasswordForm token={token} />
          </>
        ) : (
          <div className={styles.form}>
            <Alert data-color={valid === null ? "warning" : "danger"}>
              {valid === null
                ? t("errors.unavailable")
                : t("errors.linkInvalid")}{" "}
              {valid === false && (
                <Link asChild>
                  <NextLink href="/forgot-password">
                    {t("reset.newLink")}
                  </NextLink>
                </Link>
              )}
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}

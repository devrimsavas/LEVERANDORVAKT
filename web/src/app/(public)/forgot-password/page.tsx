import type { Metadata } from "next";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Heading, Link, Paragraph } from "@digdir/designsystemet-react";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";
import styles from "@/components/AuthForms.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: `${t("title")} – Leverandørvakt` };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.card}>
        <Heading level={1} data-size="md">
          {t("forgot.title")}
        </Heading>
        <Paragraph>{t("forgot.lead")}</Paragraph>
        <ForgotPasswordForm />
        <Paragraph className={styles.switch}>
          <Link asChild>
            <NextLink href="/login">{t("forgot.toLogin")}</NextLink>
          </Link>
        </Paragraph>
      </div>
    </div>
  );
}

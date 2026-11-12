import type { Metadata } from "next";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Heading, Link, Paragraph } from "@digdir/designsystemet-react";
import { RegisterForm } from "@/components/RegisterForm";
import styles from "@/components/AuthForms.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.register");
  return { title: `${t("title")} – Leverandørvakt` };
}

export default async function RegisterPage() {
  const t = await getTranslations("auth");

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.card}>
        <Heading level={1} data-size="md">
          {t("register.title")}
        </Heading>
        <Paragraph>{t("register.lead")}</Paragraph>
        <RegisterForm />
        <Paragraph className={styles.switch}>
          {t("register.haveAccount")}{" "}
          <Link asChild>
            <NextLink href="/login">{t("register.toLogin")}</NextLink>
          </Link>
        </Paragraph>
      </div>
    </div>
  );
}

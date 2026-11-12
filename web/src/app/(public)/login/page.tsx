import type { Metadata } from "next";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert, Heading, Link, Paragraph } from "@digdir/designsystemet-react";
import { LoginForm } from "@/components/LoginForm";
import { safeNextPath } from "@/lib/redirect";
import styles from "@/components/AuthForms.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: `${t("title")} – Leverandørvakt` };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = await getTranslations("auth");
  const { next, expired } = await searchParams;
  // Only a path on this site is passed on to the form
  const nextPath = typeof next === "string" ? safeNextPath(next) : undefined;

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.card}>
        <Heading level={1} data-size="md">
          {t("login.title")}
        </Heading>
        <Paragraph>{t("login.lead")}</Paragraph>
        {expired && (
          <Alert data-color="info" style={{ marginTop: "var(--ds-size-4)" }}>
            {t("login.expired")}
          </Alert>
        )}
        <LoginForm next={nextPath} />
        <Paragraph className={styles.switch}>
          {t("login.noAccount")}{" "}
          <Link asChild>
            <NextLink href="/register">{t("login.toRegister")}</NextLink>
          </Link>
        </Paragraph>
      </div>
    </div>
  );
}

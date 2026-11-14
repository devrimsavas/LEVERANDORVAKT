import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  Alert,
  Button,
  Heading,
  Paragraph,
} from "@digdir/designsystemet-react";
import { DownloadIcon } from "@navikt/aksel-icons";
import { requireUser } from "@/lib/user";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import styles from "@/components/settings/settings.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("title")} – Leverandørvakt` };
}

// The user's own account: who they are, a new password, all their data as
// a file, and deleting the account
export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const user = await requireUser();
  const t = await getTranslations("settings");
  const format = await getFormatter();
  const { export: exportState } = await searchParams;

  return (
    <div className={`container ${styles.page}`}>
      <div>
        <Heading level={1} data-size="lg">
          {t("title")}
        </Heading>
        <Paragraph className={styles.lead}>{t("lead")}</Paragraph>
      </div>

      <section className={styles.section} aria-labelledby="account">
        <Heading id="account" level={2} data-size="sm">
          {t("account.title")}
        </Heading>
        <dl className={styles.facts}>
          <dt>{t("account.name")}</dt>
          <dd>
            {user.firstName} {user.lastName}
          </dd>
          <dt>{t("account.email")}</dt>
          <dd>{user.email}</dd>
          <dt>{t("account.since")}</dt>
          <dd>
            {format.dateTime(new Date(user.createdAt), { dateStyle: "long" })}
          </dd>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="password">
        <Heading id="password" level={2} data-size="sm">
          {t("password.title")}
        </Heading>
        <Paragraph>{t("password.text")}</Paragraph>
        <ChangePasswordForm />
      </section>

      <section className={styles.section} aria-labelledby="data">
        <Heading id="data" level={2} data-size="sm">
          {t("data.title")}
        </Heading>
        <Paragraph>{t("data.text")}</Paragraph>
        {exportState === "failed" && (
          <Alert data-color="danger">{t("data.failed")}</Alert>
        )}
        <div>
          <Button asChild variant="secondary">
            {/* A plain link: the browser downloads the file */}
            <a href="/settings/export" download>
              <DownloadIcon aria-hidden />
              {t("data.button")}
            </a>
          </Button>
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.danger}`}
        aria-labelledby="delete"
      >
        <Heading id="delete" level={2} data-size="sm">
          {t("delete.heading")}
        </Heading>
        <Paragraph>{t("delete.intro")}</Paragraph>
        <DeleteAccount />
      </section>
    </div>
  );
}

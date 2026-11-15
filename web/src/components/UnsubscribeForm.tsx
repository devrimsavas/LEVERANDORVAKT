"use client";

import { useActionState } from "react";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { Alert, Button, Link, Paragraph } from "@digdir/designsystemet-react";
import {
  unsubscribeAction,
  type UnsubscribeState,
} from "@/lib/unsubscribeActions";
import styles from "./AuthForms.module.css";

// One button, so opening the link alone changes nothing: email scanners
// open every link in an email, but they do not press buttons
export function UnsubscribeForm({ token }: { token: string }) {
  const t = useTranslations("unsubscribe");
  const [state, action, pending] = useActionState<UnsubscribeState, FormData>(
    unsubscribeAction,
    {},
  );

  if (state.done) {
    return (
      <div className={styles.form}>
        <Alert data-color="success" role="status">
          {t("done")}
        </Alert>
        <Paragraph>
          {t("again")}{" "}
          <Link asChild>
            <NextLink href="/settings">{t("settingsLink")}</NextLink>
          </Link>
        </Paragraph>
      </div>
    );
  }

  return (
    <form action={action} className={styles.form}>
      {state.error && (
        <Alert
          data-color={state.error === "linkInvalid" ? "danger" : "warning"}
          role="alert"
        >
          {t(`errors.${state.error}`)}
        </Alert>
      )}
      <Paragraph>{t("lead")}</Paragraph>
      <input type="hidden" name="token" value={token} />
      <div>
        <Button type="submit" loading={pending} disabled={pending}>
          {t("button")}
        </Button>
      </div>
    </form>
  );
}

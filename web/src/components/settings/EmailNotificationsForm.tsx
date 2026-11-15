"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Fieldset, Radio } from "@digdir/designsystemet-react";
import {
  EMAIL_NOTIFICATIONS,
  type EmailNotifications,
} from "@/lib/preferences";
import {
  saveEmailNotificationsAction,
  type EmailNotificationsState,
} from "@/lib/preferencesActions";
import styles from "./settings.module.css";

export function EmailNotificationsForm({
  current,
}: {
  current: EmailNotifications;
}) {
  const t = useTranslations("settings.emails");
  const [state, action, pending] = useActionState<
    EmailNotificationsState,
    FormData
  >(saveEmailNotificationsAction, {});

  return (
    <form action={action} className={styles.form}>
      {state.saved && (
        <Alert data-color="success" role="status">
          {t(`saved.${state.saved}`)}
        </Alert>
      )}
      {state.error && (
        <Alert data-color="danger" role="alert">
          {t("failed")}
        </Alert>
      )}
      <Fieldset>
        <Fieldset.Legend>{t("legend")}</Fieldset.Legend>
        {EMAIL_NOTIFICATIONS.map((choice) => (
          <Radio
            key={choice}
            name="emailNotifications"
            value={choice}
            label={t(`choices.${choice}.label`)}
            description={t(`choices.${choice}.description`)}
            defaultChecked={choice === current}
          />
        ))}
      </Fieldset>
      <div>
        <Button type="submit" loading={pending} disabled={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

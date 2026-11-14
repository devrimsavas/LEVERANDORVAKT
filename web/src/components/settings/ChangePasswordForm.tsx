"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Textfield } from "@digdir/designsystemet-react";
import type { AuthFormState } from "@/lib/authActions";
import { MIN_PASSWORD_LENGTH } from "@/lib/authRules";
import { changePasswordAction } from "@/lib/accountActions";
import styles from "./settings.module.css";

export function ChangePasswordForm() {
  const t = useTranslations();
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    changePasswordAction,
    {},
  );
  const error = (key: "currentPassword" | "password" | "confirmPassword") => {
    const code = state.fieldErrors?.[key];
    return code
      ? t(`auth.errors.${code}`, { min: MIN_PASSWORD_LENGTH, minutes: 1 })
      : undefined;
  };

  return (
    <form action={action} className={styles.form} noValidate>
      {state.changed && (
        <Alert data-color="success" role="status">
          {t("settings.password.changed")}
        </Alert>
      )}
      {state.formError && (
        <Alert data-color="danger" role="alert">
          {t(`auth.errors.${state.formError}`, {
            minutes: state.retryMinutes ?? 1,
          })}
        </Alert>
      )}
      <Textfield
        label={t("settings.password.current")}
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        error={error("currentPassword")}
        required
      />
      <Textfield
        label={t("settings.password.new")}
        description={t("auth.passwordHint", { min: MIN_PASSWORD_LENGTH })}
        name="password"
        type="password"
        autoComplete="new-password"
        error={error("password")}
        required
      />
      <Textfield
        label={t("auth.confirmPassword")}
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={error("confirmPassword")}
        required
      />
      <div>
        <Button type="submit" loading={pending} disabled={pending}>
          {t("settings.password.submit")}
        </Button>
      </div>
    </form>
  );
}

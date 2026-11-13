"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Textfield } from "@digdir/designsystemet-react";
import type { AuthFormState } from "@/lib/authActions";
import { requestPasswordResetAction } from "@/lib/passwordResetActions";
import styles from "./AuthForms.module.css";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordResetAction,
    {},
  );

  // The same message whether or not an account has the email
  if (state.sent) {
    return (
      <div className={styles.form}>
        <Alert data-color="success" role="status">
          {t("forgot.sent", { email: state.values?.email ?? "" })}
        </Alert>
      </div>
    );
  }

  const emailError = state.fieldErrors?.email;
  return (
    <form action={action} className={styles.form} noValidate>
      {state.formError && (
        <Alert data-color="danger" role="alert">
          {t(`errors.${state.formError}`, {
            minutes: state.retryMinutes ?? 1,
          })}
        </Alert>
      )}
      <Textfield
        label={t("email")}
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={emailError ? t(`errors.${emailError}`) : undefined}
        required
      />
      <Button type="submit" loading={pending} disabled={pending}>
        {t("forgot.submit")}
      </Button>
    </form>
  );
}

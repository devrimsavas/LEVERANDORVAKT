"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Textfield } from "@digdir/designsystemet-react";
import { registerAction, type AuthFormState } from "@/lib/authActions";
import { MIN_PASSWORD_LENGTH } from "@/lib/authRules";
import styles from "./AuthForms.module.css";

export function RegisterForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    registerAction,
    {},
  );
  const error = (key: keyof NonNullable<AuthFormState["fieldErrors"]>) => {
    const code = state.fieldErrors?.[key];
    return code ? t(`errors.${code}`, { min: MIN_PASSWORD_LENGTH }) : undefined;
  };

  return (
    <form action={action} className={styles.form} noValidate>
      {state.formError && (
        <Alert data-color="danger" role="alert">
          {t(`errors.${state.formError}`, {
            minutes: state.retryMinutes ?? 1,
          })}
        </Alert>
      )}
      <div className={styles.names}>
        <Textfield
          label={t("firstName")}
          name="firstName"
          autoComplete="given-name"
          defaultValue={state.values?.firstName}
          error={error("firstName")}
          required
        />
        <Textfield
          label={t("lastName")}
          name="lastName"
          autoComplete="family-name"
          defaultValue={state.values?.lastName}
          error={error("lastName")}
          required
        />
      </div>
      <Textfield
        label={t("email")}
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={error("email")}
        required
      />
      <Textfield
        label={t("password")}
        description={t("passwordHint", { min: MIN_PASSWORD_LENGTH })}
        name="password"
        type="password"
        autoComplete="new-password"
        error={error("password")}
        required
      />
      <Textfield
        label={t("confirmPassword")}
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={error("confirmPassword")}
        required
      />
      <Button type="submit" loading={pending} disabled={pending}>
        {t("register.submit")}
      </Button>
    </form>
  );
}

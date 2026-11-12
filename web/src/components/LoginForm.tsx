"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Textfield } from "@digdir/designsystemet-react";
import { loginAction, type AuthFormState } from "@/lib/authActions";
import styles from "./AuthForms.module.css";

// The form posts to a server action: the password goes to the Next server,
// which logs in against the API and keeps the token in an httpOnly cookie
export function LoginForm({ next }: { next: string | undefined }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    loginAction,
    {},
  );
  const error = (key: keyof NonNullable<AuthFormState["fieldErrors"]>) => {
    const code = state.fieldErrors?.[key];
    return code ? t(`errors.${code}`) : undefined;
  };

  return (
    <form action={action} className={styles.form} noValidate>
      {state.formError && (
        <Alert data-color="danger" role="alert">
          {t(`errors.${state.formError}`)}
        </Alert>
      )}
      {next && <input type="hidden" name="next" value={next} />}
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
        name="password"
        type="password"
        autoComplete="current-password"
        error={error("password")}
        required
      />
      <Button type="submit" loading={pending} disabled={pending}>
        {t("login.submit")}
      </Button>
    </form>
  );
}

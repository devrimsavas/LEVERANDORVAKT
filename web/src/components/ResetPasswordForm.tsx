"use client";

import { useActionState } from "react";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { Alert, Button, Link, Textfield } from "@digdir/designsystemet-react";
import type { AuthFormState } from "@/lib/authActions";
import { MIN_PASSWORD_LENGTH } from "@/lib/authRules";
import { resetPasswordAction } from "@/lib/passwordResetActions";
import styles from "./AuthForms.module.css";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    resetPasswordAction,
    {},
  );
  const error = (key: "password" | "confirmPassword") => {
    const code = state.fieldErrors?.[key];
    return code ? t(`errors.${code}`, { min: MIN_PASSWORD_LENGTH }) : undefined;
  };

  return (
    <form action={action} className={styles.form} noValidate>
      {state.formError && (
        <Alert data-color="danger" role="alert">
          {t(`errors.${state.formError}`, { minutes: 1 })}{" "}
          {state.formError === "linkInvalid" && (
            <Link asChild>
              <NextLink href="/forgot-password">{t("reset.newLink")}</NextLink>
            </Link>
          )}
        </Alert>
      )}
      <input type="hidden" name="token" value={token} />
      <Textfield
        label={t("reset.password")}
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
        {t("reset.submit")}
      </Button>
    </form>
  );
}

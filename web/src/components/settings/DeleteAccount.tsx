"use client";

import { useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Button,
  Dialog,
  Heading,
  Paragraph,
  Textfield,
} from "@digdir/designsystemet-react";
import { TrashIcon } from "@navikt/aksel-icons";
import type { AuthFormState } from "@/lib/authActions";
import { deleteAccountAction } from "@/lib/accountActions";
import styles from "./settings.module.css";

// Deleting the account asks for the password in a dialog first, since it
// cannot be undone
export function DeleteAccount() {
  const t = useTranslations();
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    deleteAccountAction,
    {},
  );
  const passwordError = state.fieldErrors?.password;

  return (
    <>
      <div>
        <Button
          variant="secondary"
          data-color="danger"
          onClick={() => dialog.current?.showModal()}
        >
          <TrashIcon aria-hidden />
          {t("settings.delete.button")}
        </Button>
      </div>
      <Dialog
        ref={dialog}
        closedby="any"
        closeButton={t("settings.delete.cancel")}
      >
        <div className={styles.dialog}>
          <Heading level={2} data-size="xs">
            {t("settings.delete.title")}
          </Heading>
          <Paragraph>{t("settings.delete.text")}</Paragraph>
          <form action={action} className={styles.form} noValidate>
            {state.formError && (
              <Alert data-color="danger" role="alert">
                {t(`auth.errors.${state.formError}`, {
                  minutes: state.retryMinutes ?? 1,
                })}
              </Alert>
            )}
            <Textfield
              label={t("settings.delete.password")}
              name="password"
              type="password"
              autoComplete="current-password"
              error={
                passwordError ? t(`auth.errors.${passwordError}`) : undefined
              }
              required
            />
            <div className={styles.actions}>
              <Button
                type="submit"
                data-color="danger"
                loading={pending}
                disabled={pending}
              >
                {t("settings.delete.confirm")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => dialog.current?.close()}
              >
                {t("settings.delete.cancel")}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </>
  );
}

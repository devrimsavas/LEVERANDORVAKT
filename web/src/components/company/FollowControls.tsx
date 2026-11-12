"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Button,
  Dialog,
  Heading,
  Paragraph,
} from "@digdir/designsystemet-react";
import { CheckmarkIcon, PlusIcon } from "@navikt/aksel-icons";
import { followCompany, unfollowCompany } from "@/lib/watchlistActions";
import styles from "./company.module.css";

interface FollowControlsProps {
  orgNumber: string;
  name: string;
  followed: boolean;
}

// Follow / stop following. Stopping asks first, because the private note is
// deleted with it.
export function FollowControls({
  orgNumber,
  name,
  followed,
}: FollowControlsProps) {
  const t = useTranslations("company.follow");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  function run(action: (org: string) => Promise<{ ok: boolean }>) {
    setFailed(false);
    startTransition(async () => {
      const result = await action(orgNumber);
      if (!result.ok) setFailed(true);
      dialog.current?.close();
    });
  }

  return (
    <div className={styles.follow}>
      {followed ? (
        <>
          <span className={styles.following}>
            <CheckmarkIcon aria-hidden />
            {t("following")}
          </span>
          <Button
            variant="tertiary"
            onClick={() => dialog.current?.showModal()}
            disabled={pending}
          >
            {t("unfollow")}
          </Button>
          <Dialog ref={dialog} closedby="any" closeButton={t("close")}>
            <Heading level={2} data-size="xs">
              {t("confirmTitle", { name })}
            </Heading>
            <Paragraph>{t("confirmText")}</Paragraph>
            <div className={styles.dialogActions}>
              <Button
                data-color="danger"
                onClick={() => run(unfollowCompany)}
                loading={pending}
              >
                {t("confirm")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => dialog.current?.close()}
              >
                {t("cancel")}
              </Button>
            </div>
          </Dialog>
        </>
      ) : (
        <Button
          onClick={() => run(followCompany)}
          loading={pending}
          disabled={pending}
        >
          {!pending && <PlusIcon aria-hidden />}
          {t("follow")}
        </Button>
      )}
      {failed && (
        <Alert data-color="danger" data-size="sm" role="alert">
          {t("failed")}
        </Alert>
      )}
    </div>
  );
}

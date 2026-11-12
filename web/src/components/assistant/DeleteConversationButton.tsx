"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  Heading,
  Paragraph,
} from "@digdir/designsystemet-react";
import { TrashIcon } from "@navikt/aksel-icons";
import { deleteConversation } from "@/lib/assistantActions";
import styles from "./assistant.module.css";

// Deleting asks first. It removes the conversation, not the questions
// counted towards the daily limit.
export function DeleteConversationButton({
  id,
  title,
  isOpen,
}: {
  id: string;
  title: string;
  isOpen: boolean;
}) {
  const t = useTranslations("assistant.delete");
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="tertiary"
        icon
        data-size="sm"
        aria-label={t("label", { title })}
        title={t("label", { title })}
        onClick={() => dialog.current?.showModal()}
      >
        <TrashIcon aria-hidden />
      </Button>
      <Dialog ref={dialog} closedby="any" closeButton={t("cancel")}>
        <Heading level={2} data-size="xs">
          {t("title")}
        </Heading>
        <Paragraph>{t("text")}</Paragraph>
        <div className={styles.dialogActions}>
          <Button
            data-color="danger"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteConversation(id);
                dialog.current?.close();
                if (isOpen) router.replace("/assistant");
              })
            }
          >
            {t("confirm")}
          </Button>
          <Button variant="secondary" onClick={() => dialog.current?.close()}>
            {t("cancel")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

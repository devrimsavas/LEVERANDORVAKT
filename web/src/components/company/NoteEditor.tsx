"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button, Paragraph, Textfield } from "@digdir/designsystemet-react";
import { MAX_NOTE_LENGTH } from "@/lib/companyTypes";
import { saveNote, type NoteState } from "@/lib/watchlistActions";
import styles from "./company.module.css";

// The user's private note on a followed company. Only the user sees it;
// it is never sent to the AI assistant.
export function NoteEditor({
  orgNumber,
  note,
}: {
  orgNumber: string;
  note: string | null;
}) {
  const t = useTranslations("company.note");
  const [state, action, pending] = useActionState<NoteState, FormData>(
    saveNote.bind(null, orgNumber),
    {},
  );
  const error =
    state.result && !state.result.ok
      ? t(state.result.error, { max: MAX_NOTE_LENGTH })
      : undefined;

  return (
    <form action={action} className={styles.note}>
      <Textfield
        multiline
        rows={3}
        name="note"
        label={t("label")}
        description={t("description")}
        defaultValue={note ?? ""}
        counter={{
          limit: MAX_NOTE_LENGTH,
          under: t("charsLeft"),
          over: t("charsOver"),
        }}
        error={error}
      />
      <div className={styles.noteActions}>
        <Button
          type="submit"
          variant="secondary"
          data-size="sm"
          loading={pending}
          disabled={pending}
        >
          {t("save")}
        </Button>
        {state.result?.ok && !pending && (
          <Paragraph data-size="sm" role="status" key={state.savedAt}>
            {t("saved")}
          </Paragraph>
        )}
      </div>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button } from "@digdir/designsystemet-react";
import { PlayIcon } from "@navikt/aksel-icons";
import { runJob } from "@/lib/adminActions";
import type { JobKind, JobResult } from "@/lib/adminTypes";
import styles from "./admin.module.css";

// Starts a background job and shows what the run did. A run can take a
// while, since it asks Brreg about every company that needs it.
export function RunJobButton({
  kind,
  disabled,
}: {
  kind: JobKind;
  disabled: boolean;
}) {
  const t = useTranslations("admin.run");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<JobResult | null>(null);

  return (
    <div className={styles.run}>
      <Button
        variant="secondary"
        data-size="sm"
        loading={pending}
        disabled={pending || disabled}
        onClick={() => {
          setResult(null);
          startTransition(async () => setResult(await runJob(kind)));
        }}
      >
        {!pending && <PlayIcon aria-hidden />}
        {pending ? t("running") : t("button")}
      </Button>
      <div aria-live="polite">
        {result?.ok === true && (
          <Alert data-color="success" data-size="sm">
            {result.summary.initialized
              ? t("initialized")
              : t("done", {
                  checked: result.summary.companiesChecked,
                  changes: result.summary.changesFound,
                  failed: result.summary.failedCompanies,
                })}
          </Alert>
        )}
        {result?.ok === false && (
          <Alert
            data-color={result.error === "running" ? "warning" : "danger"}
            data-size="sm"
          >
            {t(result.error === "running" ? "alreadyRunning" : "failed")}
          </Alert>
        )}
      </div>
    </div>
  );
}

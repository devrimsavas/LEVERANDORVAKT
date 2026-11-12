"use client";

import { useState, useTransition } from "react";
import { Button } from "@digdir/designsystemet-react";
import { XMarkIcon } from "@navikt/aksel-icons";
import { dismissOnboarding } from "@/lib/onboardingActions";

export function DismissOnboardingButton({
  label,
  failedLabel,
}: {
  label: string;
  failedLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Button
        variant="tertiary"
        data-size="sm"
        loading={pending}
        disabled={pending}
        onClick={() =>
          startTransition(async () => setFailed(!(await dismissOnboarding())))
        }
      >
        {!pending && <XMarkIcon aria-hidden />}
        {label}
      </Button>
      {failed && (
        <span role="alert" data-color="danger">
          {failedLabel}
        </span>
      )}
    </>
  );
}

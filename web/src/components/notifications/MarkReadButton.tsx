"use client";

import { useTransition } from "react";
import { Button } from "@digdir/designsystemet-react";
import { CheckmarkIcon } from "@navikt/aksel-icons";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notificationActions";

// "Mark as read" for one notification, or for all when no id is given
export function MarkReadButton({ id, label }: { id?: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={id ? "tertiary" : "secondary"}
      data-size="sm"
      loading={pending}
      disabled={pending}
      onClick={() =>
        startTransition(() =>
          id ? markNotificationRead(id) : markAllNotificationsRead(),
        )
      }
    >
      {!pending && <CheckmarkIcon aria-hidden />}
      {label}
    </Button>
  );
}

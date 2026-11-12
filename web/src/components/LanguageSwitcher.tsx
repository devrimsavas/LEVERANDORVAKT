"use client";

import { useTransition } from "react";
import { Button } from "@digdir/designsystemet-react";
import { LanguageIcon } from "@navikt/aksel-icons";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/config";
import styles from "./SiteHeader.module.css";

interface LanguageSwitcherProps {
  // The language to switch to, and its name written in that language
  target: Locale;
  text: string;
  label: string;
}

// Shows the other language by its own name ("Norsk" / "English"), the
// usual pattern on Norwegian public sites
export function LanguageSwitcher({
  target,
  text,
  label,
}: LanguageSwitcherProps) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="tertiary"
      lang={target}
      aria-label={label}
      disabled={pending}
      onClick={() => startTransition(() => setLocale(target))}
    >
      <LanguageIcon aria-hidden className={styles.languageIcon} />
      <span className={styles.languageName}>{text}</span>
      {/* On phones only the short code fits: NO / EN */}
      <span className={styles.languageCode} aria-hidden>
        {target === "nb" ? "NO" : "EN"}
      </span>
    </Button>
  );
}

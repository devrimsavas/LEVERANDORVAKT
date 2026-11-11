"use client";

import { Button } from "@digdir/designsystemet-react";
import { MoonIcon, SunIcon } from "@navikt/aksel-icons";
import {
  COLOR_SCHEME_COOKIE,
  COLOR_SCHEME_COOKIE_MAX_AGE,
} from "@/lib/colorScheme";
import styles from "./SiteHeader.module.css";

// Switches between light and dark mode. The change is shown at once by
// setting data-color-scheme on <html>, and saved in a cookie so the server
// renders the same mode next time (no flash of the wrong colors).
export function ColorSchemeToggle({ label }: { label: string }) {
  function toggle() {
    const root = document.documentElement;
    const current = root.dataset.colorScheme;
    const isDark =
      current === "dark" ||
      (current !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";

    root.dataset.colorScheme = next;
    document.cookie = `${COLOR_SCHEME_COOKIE}=${next}; path=/; max-age=${COLOR_SCHEME_COOKIE_MAX_AGE}; samesite=lax`;
  }

  // Both icons are rendered and CSS shows the right one, because the server
  // cannot know the operating system setting when the mode is "auto"
  return (
    <Button
      variant="tertiary"
      icon
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      <MoonIcon aria-hidden className={styles.moon} />
      <SunIcon aria-hidden className={styles.sun} />
    </Button>
  );
}

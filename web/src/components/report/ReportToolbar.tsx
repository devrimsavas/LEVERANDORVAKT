"use client";

import { useEffect } from "react";
import NextLink from "next/link";
import { Button, Link, Paragraph } from "@digdir/designsystemet-react";
import { ArrowLeftIcon, PrinterSmallIcon } from "@navikt/aksel-icons";
import styles from "./report.module.css";

// The buttons above the report, left out of the printout. A dark color
// scheme would print light text, so the page is light while it prints,
// also when the browser's own print command is used.
export function ReportToolbar({
  backHref,
  backText,
  printText,
  hint,
}: {
  backHref: string;
  backText: string;
  printText: string;
  hint: string;
}) {
  useEffect(() => {
    const html = document.documentElement;
    let previous: string | null = null;
    const before = () => {
      previous = html.getAttribute("data-color-scheme");
      html.setAttribute("data-color-scheme", "light");
    };
    const after = () => {
      if (previous !== null) html.setAttribute("data-color-scheme", previous);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  return (
    <div className={styles.toolbar} data-print="hide">
      <Link asChild data-size="sm">
        <NextLink href={backHref}>
          <ArrowLeftIcon aria-hidden />
          {backText}
        </NextLink>
      </Link>
      <div className={styles.print}>
        <Button onClick={() => window.print()}>
          <PrinterSmallIcon aria-hidden />
          {printText}
        </Button>
        <Paragraph data-size="sm" className={styles.hint}>
          {hint}
        </Paragraph>
      </div>
    </div>
  );
}

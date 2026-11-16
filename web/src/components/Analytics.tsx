"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { COUNTER_SCRIPT, countedPath } from "@/lib/analytics";

declare global {
  interface Window {
    goatcounter?: {
      count?: (vars: { path: string; title: string }) => void;
    };
  }
}

// Loads GoatCounter and counts every page the user opens. GoatCounter only
// counts the first page load by itself (turned off here with no_onload);
// moving between pages in the app loads no new page, so each one is
// counted when the path changes.
export function Analytics({ url, nonce }: { url: string; nonce?: string }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const path = countedPath(pathname);
    // The title would name the company too; the path says enough
    window.goatcounter?.count?.({ path, title: path });
  }, [ready, pathname]);

  return (
    <Script
      src={COUNTER_SCRIPT}
      data-goatcounter={url}
      data-goatcounter-settings='{"no_onload": true}'
      strategy="afterInteractive"
      nonce={nonce}
      onReady={() => setReady(true)}
    />
  );
}

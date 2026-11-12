"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import styles from "./SiteHeader.module.css";

export interface NavLink {
  href: string;
  text: string;
}

// The app's main links. The current page is marked with aria-current, so
// screen readers announce it and CSS underlines it.
export function AppNav({ label, links }: { label: string; links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label={label}>
      <ul>
        {links.map((link) => {
          const current =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <NextLink
                href={link.href}
                aria-current={current ? "page" : undefined}
              >
                {link.text}
              </NextLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import NextLink from "next/link";
import { Button, Dropdown } from "@digdir/designsystemet-react";
import { MenuHamburgerIcon } from "@navikt/aksel-icons";
import styles from "./SiteHeader.module.css";

interface MobileMenuProps {
  label: string;
  links: { href: string; text: string }[];
}

// The navigation links on small screens, behind a menu button
export function MobileMenu({ label, links }: MobileMenuProps) {
  return (
    <div className={styles.mobileMenu}>
      <Button variant="tertiary" popoverTarget="site-menu" aria-label={label}>
        <MenuHamburgerIcon aria-hidden />
        <span className={styles.menuText}>{label}</span>
      </Button>
      <Dropdown id="site-menu" placement="bottom-end">
        <Dropdown.List>
          {links.map((link) => (
            <Dropdown.Item key={link.href}>
              <Dropdown.Button asChild>
                <NextLink href={link.href}>{link.text}</NextLink>
              </Dropdown.Button>
            </Dropdown.Item>
          ))}
        </Dropdown.List>
      </Dropdown>
    </div>
  );
}

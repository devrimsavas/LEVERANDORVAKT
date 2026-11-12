"use client";

import NextLink from "next/link";
import { Button, Dropdown } from "@digdir/designsystemet-react";
import { BookIcon, PersonCircleIcon } from "@navikt/aksel-icons";
import { logoutAction } from "@/lib/authActions";
import styles from "./SiteHeader.module.css";

interface UserMenuProps {
  name: string;
  email: string;
  label: string;
  logoutLabel: string;
  guideLabel: string;
}

// The logged-in user's name, with the guide and log out behind it
export function UserMenu({
  name,
  email,
  label,
  logoutLabel,
  guideLabel,
}: UserMenuProps) {
  return (
    <div className={styles.userMenu}>
      <Button variant="tertiary" popoverTarget="user-menu" aria-label={label}>
        <PersonCircleIcon aria-hidden />
        <span className={styles.userName}>{name}</span>
      </Button>
      <Dropdown id="user-menu" placement="bottom-end">
        <Dropdown.Heading>
          {name}
          <span className={styles.userEmail}>{email}</span>
        </Dropdown.Heading>
        <Dropdown.List>
          <Dropdown.Item>
            <Dropdown.Button asChild>
              <NextLink href="/guide">
                <BookIcon aria-hidden />
                {guideLabel}
              </NextLink>
            </Dropdown.Button>
          </Dropdown.Item>
          <Dropdown.Item>
            <form action={logoutAction}>
              <Dropdown.Button type="submit">{logoutLabel}</Dropdown.Button>
            </form>
          </Dropdown.Item>
        </Dropdown.List>
      </Dropdown>
    </div>
  );
}

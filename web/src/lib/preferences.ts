// When the user wants notification emails, as the API stores it
export const EMAIL_NOTIFICATIONS = ["instant", "daily", "off"] as const;
export type EmailNotifications = (typeof EMAIL_NOTIFICATIONS)[number];

export function isEmailNotifications(
  value: unknown,
): value is EmailNotifications {
  return (
    typeof value === "string" &&
    EMAIL_NOTIFICATIONS.includes(value as EmailNotifications)
  );
}

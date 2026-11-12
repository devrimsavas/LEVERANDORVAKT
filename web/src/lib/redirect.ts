// Where to go after logging in. Only paths on this site are accepted, so a
// link like /login?next=https://evil.example cannot send users elsewhere.
export const HOME_AFTER_LOGIN = "/overview";

export function safeNextPath(value: unknown): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
  ) {
    return value;
  }
  return HOME_AFTER_LOGIN;
}

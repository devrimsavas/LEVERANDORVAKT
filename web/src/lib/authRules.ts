// The same rules the API uses for registration, checked here first so the
// user gets a message per field. The API still checks everything itself.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_NAME_LENGTH = 100;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Light or dark mode. "auto" follows the operating system and is used
// until the user picks one.
export const colorSchemes = ["light", "dark", "auto"] as const;
export type ColorScheme = (typeof colorSchemes)[number];

export const COLOR_SCHEME_COOKIE = "color-scheme";
export const COLOR_SCHEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseColorScheme(value: unknown): ColorScheme {
  return colorSchemes.includes(value as ColorScheme)
    ? (value as ColorScheme)
    : "auto";
}

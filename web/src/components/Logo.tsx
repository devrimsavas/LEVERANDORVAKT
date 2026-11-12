// The Leverandørvakt mark: a shield (protection) with a watching eye.
// Colors come from the theme, so it works in light and dark mode.
export function LogoMark({ size = 30 }: { size?: number }) {
  // The view box is cut tight around the shield, so the mark lines up
  // exactly with the page content below it
  return (
    <svg
      width={(size * 23) / 27}
      height={size}
      viewBox="4.5 2.5 23 27"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 2.5 27.5 6.5v8.6c0 7.1-4.8 12.6-11.5 14.4C9.3 27.7 4.5 22.2 4.5 15.1V6.5Z"
        fill="var(--ds-color-accent-base-default)"
      />
      <path
        d="M8.5 15.5c2-3.2 4.6-4.8 7.5-4.8s5.5 1.6 7.5 4.8c-2 3.2-4.6 4.8-7.5 4.8s-5.5-1.6-7.5-4.8Z"
        fill="var(--ds-color-accent-base-contrast-default)"
      />
      <circle
        cx="16"
        cy="15.5"
        r="2.6"
        fill="var(--ds-color-accent-base-default)"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <LogoMark />
      <span className="logo-text">Leverandørvakt</span>
    </span>
  );
}

import type { Email } from "./emailSender.js";

// The languages of the web app; emails are written in the one the user
// was using
export type EmailLanguage = "en" | "nb";

export function toEmailLanguage(value: unknown): EmailLanguage {
  return value === "nb" ? "nb" : "en";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A plain layout that mail programs show well: one column, the brand
// color, a button and the link written out below it
function layout(
  paragraphs: string[],
  button: { text: string; url: string },
  footer: string,
): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${p}</p>`)
    .join("");
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f6;font-family:Arial,Helvetica,sans-serif;color:#24272b">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
<p style="margin:0 0 24px;font-size:20px;font-weight:bold;color:#0062ba">Leverandørvakt</p>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#0062ba;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">${escapeHtml(button.text)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#5d6066;word-break:break-all">${escapeHtml(button.url)}</p>
<p style="margin:24px 0 0;font-size:13px;color:#5d6066">${footer}</p>
</div></body></html>`;
}

const PASSWORD_RESET = {
  en: {
    subject: "Reset your Leverandørvakt password",
    greeting: (name: string) => `Hi ${name},`,
    body: (minutes: number) =>
      `Someone asked to reset the password for your Leverandørvakt account. Choose a new password with the link below. It works once, for ${minutes} minutes.`,
    button: "Choose a new password",
    footer:
      "If it was not you, you can ignore this email. Your password stays the same.",
  },
  nb: {
    subject: "Tilbakestill passordet ditt i Leverandørvakt",
    greeting: (name: string) => `Hei ${name},`,
    body: (minutes: number) =>
      `Noen har bedt om å tilbakestille passordet til Leverandørvakt-kontoen din. Velg et nytt passord med lenken nedenfor. Den virker én gang, i ${minutes} minutter.`,
    button: "Velg nytt passord",
    footer:
      "Hvis det ikke var deg, kan du se bort fra denne e-posten. Passordet ditt forblir det samme.",
  },
} as const;

export function passwordResetEmail(input: {
  to: string;
  firstName: string;
  language: EmailLanguage;
  link: string;
  validMinutes: number;
}): Email {
  const texts = PASSWORD_RESET[input.language];
  const greeting = texts.greeting(input.firstName);
  const body = texts.body(input.validMinutes);
  return {
    to: input.to,
    subject: texts.subject,
    text: [greeting, "", body, "", input.link, "", texts.footer].join("\n"),
    html: layout(
      [escapeHtml(greeting), escapeHtml(body)],
      { text: texts.button, url: input.link },
      escapeHtml(texts.footer),
    ),
  };
}

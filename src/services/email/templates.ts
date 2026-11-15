import type { Email } from "./emailSender.js";
import type { Language } from "../../models/User.js";
import { changeTitle, changeValues, severityLabel } from "./changeTexts.js";

// The languages of the web app; emails are written in the one the user
// was using
export type EmailLanguage = Language;

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
// color, a button and the link written out below it. extraHtml goes
// between the text and the button (the list of changes).
function layout(
  paragraphs: string[],
  button: { text: string; url: string },
  footer: string,
  extraHtml = "",
): string {
  const body =
    paragraphs
      .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${p}</p>`)
      .join("") + extraHtml;
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

// ---- Notification emails ----

export interface NotificationEmailItem {
  orgNumber: string;
  companyName: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  severity: string;
}

const NOTIFICATIONS = {
  en: {
    subjectOne: (company: string, title: string) => `${company}: ${title}`,
    subjectMany: (count: number) =>
      `${count} changes in the companies you follow`,
    subjectDigest: (count: number) =>
      count === 1
        ? "Your daily summary: 1 change"
        : `Your daily summary: ${count} changes`,
    greeting: (name: string) => `Hi ${name},`,
    introInstant: "Leverandørvakt has found changes in companies you follow:",
    introDigest:
      "Here is what has changed in the companies you follow since the last summary:",
    before: "Before",
    after: "Now",
    button: "Open your notifications",
    footer:
      "You get this email because you follow these companies in Leverandørvakt.",
    settings: "Change email settings",
    unsubscribe: "Turn off emails",
  },
  nb: {
    subjectOne: (company: string, title: string) => `${company}: ${title}`,
    subjectMany: (count: number) => `${count} endringer i selskapene du følger`,
    subjectDigest: (count: number) =>
      count === 1
        ? "Dagens oppsummering: 1 endring"
        : `Dagens oppsummering: ${count} endringer`,
    greeting: (name: string) => `Hei ${name},`,
    introInstant: "Leverandørvakt har funnet endringer i selskaper du følger:",
    introDigest:
      "Dette har endret seg i selskapene du følger siden forrige oppsummering:",
    before: "Før",
    after: "Nå",
    button: "Åpne varslene dine",
    footer:
      "Du får denne e-posten fordi du følger disse selskapene i Leverandørvakt.",
    settings: "Endre e-postinnstillinger",
    unsubscribe: "Slå av e-poster",
  },
} as const;

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#c01b1b",
  warning: "#a35200",
  info: "#0062ba",
};

export function notificationEmail(input: {
  to: string;
  firstName: string;
  language: EmailLanguage;
  kind: "instant" | "digest";
  items: NotificationEmailItem[];
  webAppUrl: string;
  unsubscribeUrl: string;
  oneClickUnsubscribeUrl: string;
}): Email {
  const texts = NOTIFICATIONS[input.language];
  const lines = input.items.map((item) => {
    const title = changeTitle(input.language, item.field, item.newValue);
    const values = changeValues(
      input.language,
      item.field,
      item.oldValue,
      item.newValue,
    );
    return {
      ...item,
      title,
      ...values,
      severityText: severityLabel(input.language, item.severity),
      url: `${input.webAppUrl}/companies/${item.orgNumber}`,
    };
  });

  const first = lines[0]!;
  const subject =
    input.kind === "digest"
      ? texts.subjectDigest(lines.length)
      : lines.length === 1
        ? texts.subjectOne(first.companyName, first.title)
        : texts.subjectMany(lines.length);
  const intro =
    input.kind === "digest" ? texts.introDigest : texts.introInstant;
  const notificationsUrl = `${input.webAppUrl}/notifications`;
  const settingsUrl = `${input.webAppUrl}/settings`;

  const text = [
    texts.greeting(input.firstName),
    "",
    intro,
    "",
    ...lines.flatMap((line) => [
      `[${line.severityText}] ${line.companyName} (${line.orgNumber}): ${line.title}`,
      `  ${texts.before}: ${line.before}`,
      `  ${texts.after}: ${line.after}`,
      `  ${line.url}`,
      "",
    ]),
    `${texts.button}: ${notificationsUrl}`,
    "",
    texts.footer,
    `${texts.settings}: ${settingsUrl}`,
    `${texts.unsubscribe}: ${input.unsubscribeUrl}`,
  ].join("\n");

  const list = lines
    .map((line) => {
      const color = SEVERITY_COLORS[line.severity] ?? "#0062ba";
      return `<div style="margin:0 0 12px;padding:12px 16px;border-left:4px solid ${color};background:#f4f5f6;border-radius:4px">
<p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:${color};text-transform:uppercase">${escapeHtml(line.severityText)}</p>
<p style="margin:0 0 4px;font-weight:bold"><a href="${escapeHtml(line.url)}" style="color:#24272b">${escapeHtml(line.companyName)}</a> <span style="font-weight:normal;color:#5d6066">${escapeHtml(line.orgNumber)}</span></p>
<p style="margin:0 0 4px">${escapeHtml(line.title)}</p>
<p style="margin:0;font-size:13px;color:#5d6066">${escapeHtml(texts.before)}: ${escapeHtml(line.before)} &rarr; ${escapeHtml(texts.after)}: ${escapeHtml(line.after)}</p>
</div>`;
    })
    .join("");

  const footer = `${escapeHtml(texts.footer)}<br><a href="${escapeHtml(settingsUrl)}" style="color:#5d6066">${escapeHtml(texts.settings)}</a> · <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#5d6066">${escapeHtml(texts.unsubscribe)}</a>`;

  return {
    to: input.to,
    subject,
    text,
    html: layout(
      [escapeHtml(texts.greeting(input.firstName)), escapeHtml(intro)],
      { text: texts.button, url: notificationsUrl },
      footer,
      list,
    ),
    // Lets mail programs show their own "unsubscribe" button, which turns
    // the emails off with one click (RFC 8058)
    headers: {
      "List-Unsubscribe": `<${input.oneClickUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

// Alerts for the admin when something goes wrong in the running app.
// Only in English: they go to whoever runs the app, not to its users.
export type AlertEmailInput =
  | {
      kind: "jobFailing";
      job: string;
      failures: number;
      problem: string;
    }
  | { kind: "jobRecovered"; job: string; failures: number }
  | {
      kind: "serverError";
      method: string;
      path: string;
      requestId: string;
      at: Date;
      // Server errors since the previous alert that got no email of their own
      earlier: number;
    };

export function alertEmail(
  input: AlertEmailInput & { to: string; webAppUrl: string },
): Email {
  let subject: string;
  let paragraphs: string[];
  switch (input.kind) {
    case "jobFailing":
      subject = `Leverandørvakt: ${input.job} has failed ${input.failures} times in a row`;
      paragraphs = [
        `${input.job} has failed ${input.failures} times in a row.`,
        `The last problem: ${input.problem}`,
        "It keeps running on its schedule. You get one more email when it works again.",
      ];
      break;
    case "jobRecovered":
      subject = `Leverandørvakt: ${input.job} works again`;
      paragraphs = [
        `${input.job} works again, after ${input.failures} failed runs in a row.`,
      ];
      break;
    case "serverError":
      subject = "Leverandørvakt: the API answered with a server error";
      paragraphs = [
        `${input.method} ${input.path} answered with 500 at ${input.at.toISOString()}.`,
        `Request id: ${input.requestId}. Search the API's log for this id to see the error.`,
        ...(input.earlier > 0
          ? [
              `There were ${input.earlier} more server errors since the previous email.`,
            ]
          : []),
        "You get at most one email like this an hour.",
      ];
      break;
  }
  const button = {
    text: "Open the admin page",
    url: `${input.webAppUrl}/admin`,
  };
  const footer =
    "You get this email because it is the alert address of Leverandørvakt (ALERT_EMAIL, or else ADMIN_EMAIL).";
  return {
    to: input.to,
    subject,
    text: [...paragraphs, `${button.text}: ${button.url}`, footer].join("\n\n"),
    html: layout(paragraphs.map(escapeHtml), button, escapeHtml(footer)),
  };
}

// Sending email. The provider is chosen with EMAIL_PROVIDER:
//   log     writes each email to the console (the default), for development
//   resend  sends it with Resend (https://resend.com), needs RESEND_API_KEY
// The rest of the app only knows the EmailSender interface, so another
// provider can be added here without touching it.

export interface Email {
  to: string;
  subject: string;
  // Both a plain-text and an HTML version, for every mail program
  text: string;
  html: string;
}

export interface EmailSender {
  send(email: Email): Promise<void>;
}

export class EmailError extends Error {}

const RESEND_URL = "https://api.resend.com/emails";

// Resend's own sender address works without setting up a domain, but only
// to the address the Resend account was made with
const DEFAULT_FROM = "Leverandørvakt <onboarding@resend.dev>";

const resendSender: EmailSender = {
  async send(email) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new EmailError("RESEND_API_KEY is not set");
    }
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Resend explains the problem in "message"; the address is not logged
      const body = (await response.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      const reason =
        typeof body?.message === "string" ? body.message : response.statusText;
      throw new EmailError(
        `Resend refused the email (${response.status}): ${reason}`,
      );
    }
  },
};

const logSender: EmailSender = {
  async send(email) {
    console.log(
      [
        "---- Email (EMAIL_PROVIDER=log, not sent) ----",
        `To: ${email.to}`,
        `Subject: ${email.subject}`,
        "",
        email.text,
        "----",
      ].join("\n"),
    );
  },
};

export function getEmailSender(): EmailSender {
  const provider = process.env.EMAIL_PROVIDER || "log";
  if (provider === "resend") return resendSender;
  if (provider === "log") return logSender;
  throw new EmailError(`Unknown EMAIL_PROVIDER "${provider}"`);
}

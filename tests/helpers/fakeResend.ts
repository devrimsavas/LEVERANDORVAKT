import type { ExtraHandler } from "./fakeRegister.js";

// A fake Resend API (https://api.resend.com/emails), answering through the
// fake fetch. It keeps every email the app sent, so tests can read them,
// for example to follow the link in a password reset email.

export interface SentEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  // The Authorization header, to check the API key is sent
  authorization: string | null;
}

export interface FakeResend {
  sent: SentEmail[];
  // Resend answers with this error until set back to null
  failure: { status: number; message: string } | null;
  handler: ExtraHandler;
  reset(): void;
}

export function createFakeResend(): FakeResend {
  const fake: FakeResend = {
    sent: [],
    failure: null,
    reset() {
      fake.sent.length = 0;
      fake.failure = null;
    },
    async handler(url, init) {
      if (url.hostname !== "api.resend.com") {
        return null;
      }
      if (fake.failure) {
        return Response.json(
          { name: "error", message: fake.failure.message },
          { status: fake.failure.status },
        );
      }
      const email = JSON.parse(String(init?.body)) as Omit<
        SentEmail,
        "authorization"
      >;
      fake.sent.push({
        ...email,
        authorization: new Headers(init?.headers).get("Authorization"),
      });
      return Response.json({ id: `email-${fake.sent.length}` });
    },
  };
  return fake;
}

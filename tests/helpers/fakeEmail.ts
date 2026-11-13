import { beforeEach, vi } from "vitest";
import type { FakeBrreg } from "./fakeBrreg.js";
import { createFakeResend, type FakeResend } from "./fakeResend.js";

export type { SentEmail } from "./fakeResend.js";

export const FAKE_RESEND_API_KEY = "re_test_key";
export const FAKE_WEB_APP_URL = "http://web.test";

// Sends the app's email to a fake Resend for every test in the file,
// starting each test with an empty outbox
export function useFakeEmail(brreg: FakeBrreg): FakeResend {
  const fake = createFakeResend();

  beforeEach(() => {
    fake.reset();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", FAKE_RESEND_API_KEY);
    vi.stubEnv("EMAIL_FROM", "Leverandørvakt <test@example.com>");
    vi.stubEnv("WEB_APP_URL", FAKE_WEB_APP_URL);
    brreg.extraHandlers.push(fake.handler);
  });

  return fake;
}

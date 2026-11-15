import {
  sendDailyDigests,
  sendInstantEmails,
  type EmailRunSummary,
} from "../services/emailNotificationService.js";

const DEFAULT_INTERVAL_MINUTES = 5;

let isRunning = false;

export function isEmailJobRunning(): boolean {
  return isRunning;
}

export interface EmailJobSummary {
  instant: EmailRunSummary;
  digest: EmailRunSummary;
}

function log(summary: EmailJobSummary): void {
  const { instant, digest } = summary;
  if (
    instant.usersEmailed +
      instant.failedUsers +
      digest.usersEmailed +
      digest.failedUsers >
    0
  ) {
    console.log(
      `Emails: ${instant.usersEmailed} at once, ${digest.usersEmailed} daily summaries, ` +
        `${instant.failedUsers + digest.failedUsers} failed`,
    );
  }
}

// Sends the emails that are due, unless a run is already in progress.
// forceDigest sends the daily summaries now (the admin's button).
// Returns null if a run was already in progress.
export async function runEmailsOnce(
  options: { forceDigest?: boolean } = {},
): Promise<EmailJobSummary | null> {
  if (isRunning) {
    return null;
  }
  isRunning = true;
  try {
    const summary = {
      instant: await sendInstantEmails(),
      digest: await sendDailyDigests({ force: options.forceDigest === true }),
    };
    log(summary);
    return summary;
  } finally {
    isRunning = false;
  }
}

// Called right after change detection and the accounts check, so critical
// changes are emailed at once instead of at the next timer run. Errors are
// logged; they never fail the check that found the changes.
export async function sendEmailsAfterChanges(): Promise<void> {
  try {
    await runEmailsOnce();
  } catch (error) {
    console.error("Emails: run failed", error);
  }
}

// Every EMAIL_CHECK_MINUTES: emails due at once, and the daily summaries
// once their hour has come. 0 turns the emails off.
export function startEmailJob(): void {
  const minutes = Number(
    process.env.EMAIL_CHECK_MINUTES ?? DEFAULT_INTERVAL_MINUTES,
  );
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.log("Emails: turned off");
    return;
  }
  console.log(`Emails: checked every ${minutes} minutes`);
  setInterval(() => void sendEmailsAfterChanges(), minutes * 60 * 1000);
}

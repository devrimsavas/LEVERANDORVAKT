import {
  sendDailyDigests,
  sendInstantEmails,
  type EmailRunSummary,
} from "../services/emailNotificationService.js";
import { moduleLogger } from "../config/logger.js";
import { recordJobRun } from "../services/alertService.js";
import { errorMessage } from "../utils/errorMessage.js";

const DEFAULT_INTERVAL_MINUTES = 5;

const log = moduleLogger("emails");

let isRunning = false;

export function isEmailJobRunning(): boolean {
  return isRunning;
}

export interface EmailJobSummary {
  instant: EmailRunSummary;
  digest: EmailRunSummary;
}

function logSummary(summary: EmailJobSummary): void {
  const { instant, digest } = summary;
  if (
    instant.usersEmailed +
      instant.failedUsers +
      digest.usersEmailed +
      digest.failedUsers >
    0
  ) {
    log.info(
      summary,
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
    let summary: EmailJobSummary;
    try {
      summary = {
        instant: await sendInstantEmails(),
        digest: await sendDailyDigests({ force: options.forceDigest === true }),
      };
    } catch (error) {
      await recordJobRun("emails", errorMessage(error));
      throw error;
    }
    logSummary(summary);
    const failed = summary.instant.failedUsers + summary.digest.failedUsers;
    await recordJobRun(
      "emails",
      failed > 0
        ? `Emails to ${failed} ${failed === 1 ? "user" : "users"} could not be sent. See the API's log.`
        : null,
    );
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
    log.error({ err: error }, "Emails: run failed");
  }
}

// Every EMAIL_CHECK_MINUTES: emails due at once, and the daily summaries
// once their hour has come. 0 turns the emails off.
export function startEmailJob(): void {
  const minutes = Number(
    process.env.EMAIL_CHECK_MINUTES ?? DEFAULT_INTERVAL_MINUTES,
  );
  if (!Number.isFinite(minutes) || minutes <= 0) {
    log.info("Emails: turned off");
    return;
  }
  log.info(`Emails: checked every ${minutes} minutes`);
  setInterval(() => void sendEmailsAfterChanges(), minutes * 60 * 1000);
}

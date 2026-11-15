import { sendEmailsAfterChanges } from "./emailJob.js";
import { moduleLogger } from "../config/logger.js";
import { recordJobRun } from "../services/alertService.js";
import { errorMessage } from "../utils/errorMessage.js";
import { runAccountsCheck } from "../services/accountsService.js";
import type { AccountsCheckSummary } from "../services/accountsService.js";

// Brreg updates the accounts register on weekdays, so once a day is enough
const DEFAULT_INTERVAL_HOURS = 24;

const log = moduleLogger("accountsCheck");

let isRunning = false;

// Whether a run is in progress right now, for the admin status page
export function isAccountsCheckRunning(): boolean {
  return isRunning;
}

// Runs the accounts check unless a run is already in progress.
// Both the timer and the admin endpoint go through here, so two runs never overlap.
// Returns null if a run was already in progress.
export async function runAccountsCheckOnce(): Promise<AccountsCheckSummary | null> {
  if (isRunning) {
    return null;
  }

  isRunning = true;
  try {
    let summary: AccountsCheckSummary;
    try {
      summary = await runAccountsCheck();
    } catch (error) {
      await recordJobRun("accountsCheck", errorMessage(error));
      throw error;
    }
    log.info(
      summary,
      `Accounts check: ${summary.companiesChecked} checked, ` +
        `${summary.changesFound} changes, ${summary.failedCompanies} failed`,
    );
    await recordJobRun(
      "accountsCheck",
      summary.failedCompanies > 0
        ? `${summary.failedCompanies} of ${summary.companiesChecked} companies could not be checked. See the API's log.`
        : null,
    );
    // Changes found now are emailed to those who want them at once
    if (summary.changesFound > 0) {
      await sendEmailsAfterChanges();
    }
    return summary;
  } finally {
    isRunning = false;
  }
}

// Runs on the timer. Errors are logged and never crash the app.
async function runScheduled(): Promise<void> {
  try {
    const summary = await runAccountsCheckOnce();
    if (summary === null) {
      log.info("Accounts check: previous run still in progress, skipped");
    }
  } catch (error) {
    log.error({ err: error }, "Accounts check: run failed");
  }
}

// Starts the accounts check on startup and then every ACCOUNTS_CHECK_INTERVAL_HOURS.
// Setting the variable to 0 turns it off.
export function startAccountsCheckJob(): void {
  const hours = Number(
    process.env.ACCOUNTS_CHECK_INTERVAL_HOURS ?? DEFAULT_INTERVAL_HOURS,
  );

  if (!Number.isFinite(hours) || hours <= 0) {
    log.info("Accounts check: turned off");
    return;
  }

  log.info(`Accounts check: every ${hours} hours`);
  void runScheduled();
  setInterval(() => void runScheduled(), hours * 60 * 60 * 1000);
}

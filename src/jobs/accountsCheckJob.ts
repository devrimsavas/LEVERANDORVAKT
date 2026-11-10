import { runAccountsCheck } from "../services/accountsService.js";
import type { AccountsCheckSummary } from "../services/accountsService.js";

// Brreg updates the accounts register on weekdays, so once a day is enough
const DEFAULT_INTERVAL_HOURS = 24;

let isRunning = false;

// Runs the accounts check unless a run is already in progress.
// Both the timer and the admin endpoint go through here, so two runs never overlap.
// Returns null if a run was already in progress.
export async function runAccountsCheckOnce(): Promise<AccountsCheckSummary | null> {
  if (isRunning) {
    return null;
  }

  isRunning = true;
  try {
    const summary = await runAccountsCheck();
    console.log(
      `Accounts check: ${summary.companiesChecked} checked, ` +
        `${summary.changesFound} changes, ${summary.failedCompanies} failed`,
    );
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
      console.log("Accounts check: previous run still in progress, skipped");
    }
  } catch (error) {
    console.error("Accounts check: run failed", error);
  }
}

// Starts the accounts check on startup and then every ACCOUNTS_CHECK_INTERVAL_HOURS.
// Setting the variable to 0 turns it off.
export function startAccountsCheckJob(): void {
  const hours = Number(
    process.env.ACCOUNTS_CHECK_INTERVAL_HOURS ?? DEFAULT_INTERVAL_HOURS,
  );

  if (!Number.isFinite(hours) || hours <= 0) {
    console.log("Accounts check: turned off");
    return;
  }

  console.log(`Accounts check: every ${hours} hours`);
  void runScheduled();
  setInterval(() => void runScheduled(), hours * 60 * 60 * 1000);
}

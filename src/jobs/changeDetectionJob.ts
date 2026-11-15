import { sendEmailsAfterChanges } from "./emailJob.js";
import { moduleLogger } from "../config/logger.js";
import { recordJobRun } from "../services/alertService.js";
import { errorMessage } from "../utils/errorMessage.js";
import { runChangeDetection } from "../services/changeDetectionService.js";
import type { ChangeDetectionSummary } from "../services/changeDetectionService.js";

const DEFAULT_INTERVAL_MINUTES = 10;

const log = moduleLogger("changeDetection");

let isRunning = false;

// Whether a run is in progress right now, for the admin status page
export function isChangeDetectionRunning(): boolean {
  return isRunning;
}

// Runs change detection unless a run is already in progress.
// Both the timer and the admin endpoint go through here, so two runs never overlap.
// Returns null if a run was already in progress.
export async function runChangeDetectionOnce(): Promise<ChangeDetectionSummary | null> {
  if (isRunning) {
    return null;
  }

  isRunning = true;
  try {
    let summary: ChangeDetectionSummary;
    try {
      summary = await runChangeDetection();
    } catch (error) {
      await recordJobRun("changeDetection", errorMessage(error));
      throw error;
    }

    if (summary.initialized) {
      log.info("Change detection: starting point recorded");
    } else {
      log.info(
        summary,
        `Change detection: ${summary.companiesChecked} checked, ` +
          `${summary.changesFound} changes, ${summary.failedCompanies} failed`,
      );
    }
    // A company that could not be checked stops the run there; it is
    // checked again on the next run
    await recordJobRun(
      "changeDetection",
      summary.failedCompanies > 0
        ? `${summary.failedCompanies} ${summary.failedCompanies === 1 ? "company" : "companies"} could not be checked. See the API's log.`
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
    const summary = await runChangeDetectionOnce();
    if (summary === null) {
      log.info("Change detection: previous run still in progress, skipped");
    }
  } catch (error) {
    log.error({ err: error }, "Change detection: run failed");
  }
}

// Starts change detection on startup and then every CHANGE_DETECTION_INTERVAL_MINUTES.
// Setting the variable to 0 turns it off.
export function startChangeDetectionJob(): void {
  const minutes = Number(
    process.env.CHANGE_DETECTION_INTERVAL_MINUTES ?? DEFAULT_INTERVAL_MINUTES,
  );

  if (!Number.isFinite(minutes) || minutes <= 0) {
    log.info("Change detection: turned off");
    return;
  }

  log.info(`Change detection: every ${minutes} minutes`);
  void runScheduled();
  setInterval(() => void runScheduled(), minutes * 60 * 1000);
}

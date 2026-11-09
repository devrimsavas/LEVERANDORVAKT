import { runChangeDetection } from "../services/changeDetectionService.js";
import type { ChangeDetectionSummary } from "../services/changeDetectionService.js";

const DEFAULT_INTERVAL_MINUTES = 10;

let isRunning = false;

// Runs change detection unless a run is already in progress.
// Both the timer and the admin endpoint go through here, so two runs never overlap.
// Returns null if a run was already in progress.
export async function runChangeDetectionOnce(): Promise<ChangeDetectionSummary | null> {
  if (isRunning) {
    return null;
  }

  isRunning = true;
  try {
    const summary = await runChangeDetection();

    if (summary.initialized) {
      console.log("Change detection: starting point recorded");
    } else {
      console.log(
        `Change detection: ${summary.companiesChecked} checked, ` +
          `${summary.changesFound} changes, ${summary.failedCompanies} failed`,
      );
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
      console.log("Change detection: previous run still in progress, skipped");
    }
  } catch (error) {
    console.error("Change detection: run failed", error);
  }
}

// Starts change detection on startup and then every CHANGE_DETECTION_INTERVAL_MINUTES.
// Setting the variable to 0 turns it off.
export function startChangeDetectionJob(): void {
  const minutes = Number(
    process.env.CHANGE_DETECTION_INTERVAL_MINUTES ?? DEFAULT_INTERVAL_MINUTES,
  );

  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.log("Change detection: turned off");
    return;
  }

  console.log(`Change detection: every ${minutes} minutes`);
  void runScheduled();
  setInterval(() => void runScheduled(), minutes * 60 * 1000);
}

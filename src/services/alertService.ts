// Emails the admin when something keeps going wrong, so problems are found
// without reading the logs every day:
//   - a background job that fails ALERT_AFTER_FAILURES runs in a row
//     (3 by default; 0 turns these alerts off), and again when it works;
//   - a server error (500) in the API, at most one email an hour.
// The alerts go to ALERT_EMAIL, or else ADMIN_EMAIL; with neither they are
// only logged. The counts are kept in memory and start again on a restart.
import { moduleLogger } from "../config/logger.js";
import { getEmailSender } from "./email/emailSender.js";
import { alertEmail, type AlertEmailInput } from "./email/templates.js";
import { webAppUrl } from "../utils/webAppUrl.js";

const log = moduleLogger("alerts");

const DEFAULT_FAILURES_BEFORE_ALERT = 3;
const SERVER_ERROR_INTERVAL_MS = 60 * 60 * 1000;

export type JobName = "changeDetection" | "accountsCheck" | "emails";

const JOB_TITLES: Record<JobName, string> = {
  changeDetection: "Change detection",
  accountsCheck: "The annual accounts check",
  emails: "Sending notification emails",
};

interface JobState {
  failures: number;
  alerted: boolean;
}

const jobs = new Map<JobName, JobState>();
let lastServerErrorAlertAt: number | null = null;
let serverErrorsSinceAlert = 0;

function recipient(): string | null {
  return process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL || null;
}

function failuresBeforeAlert(): number {
  const value = Number(
    process.env.ALERT_AFTER_FAILURES ?? DEFAULT_FAILURES_BEFORE_ALERT,
  );
  return Number.isInteger(value) && value > 0 ? value : 0;
}

// Sends an alert. Never throws: a failing alert must not make the job or
// the request that raised it fail too.
async function send(input: AlertEmailInput): Promise<boolean> {
  const to = recipient();
  if (!to) {
    log.warn(
      { alert: input.kind },
      "Alert not emailed: no ALERT_EMAIL or ADMIN_EMAIL",
    );
    return false;
  }
  try {
    await getEmailSender().send(
      alertEmail({ ...input, to, webAppUrl: webAppUrl() }),
    );
    log.info({ alert: input.kind }, "Alert emailed");
    return true;
  } catch (error) {
    log.error({ err: error, alert: input.kind }, "Alert email failed");
    return false;
  }
}

// Records how a run of a background job went: problem is null when it
// worked, otherwise what went wrong
export async function recordJobRun(
  job: JobName,
  problem: string | null,
): Promise<void> {
  const state = jobs.get(job) ?? { failures: 0, alerted: false };
  jobs.set(job, state);

  if (problem === null) {
    if (state.alerted) {
      await send({
        kind: "jobRecovered",
        job: JOB_TITLES[job],
        failures: state.failures,
      });
    }
    state.failures = 0;
    state.alerted = false;
    return;
  }

  state.failures += 1;
  const limit = failuresBeforeAlert();
  if (limit > 0 && !state.alerted && state.failures >= limit) {
    // Marked before sending, so a failed alert is not tried on every run
    state.alerted = true;
    await send({
      kind: "jobFailing",
      job: JOB_TITLES[job],
      failures: state.failures,
      problem,
    });
  }
}

// Records a server error (500) answered by the API. The first one is
// emailed; the next ones within an hour are counted and named in the next
// email.
export async function recordServerError(
  request: { method: string; path: string; requestId: string },
  now = new Date(),
): Promise<void> {
  if (
    lastServerErrorAlertAt !== null &&
    now.getTime() - lastServerErrorAlertAt < SERVER_ERROR_INTERVAL_MS
  ) {
    serverErrorsSinceAlert += 1;
    return;
  }
  const earlier = serverErrorsSinceAlert;
  lastServerErrorAlertAt = now.getTime();
  serverErrorsSinceAlert = 0;
  await send({ kind: "serverError", ...request, at: now, earlier });
}

// For tests: forgets every count
export function resetAlerts(): void {
  jobs.clear();
  lastServerErrorAlertAt = null;
  serverErrorsSinceAlert = 0;
}

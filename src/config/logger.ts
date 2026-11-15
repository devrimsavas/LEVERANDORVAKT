// The app's logger (pino). Every line is a JSON object with the time, the
// level, the message and any fields given, so logs can be searched and
// filtered on a server. LOG_FORMAT=pretty writes readable, coloured lines
// instead, for development. LOG_LEVEL sets the lowest level written
// (trace, debug, info, warn, error, fatal or silent; info by default).
import { pino, stdTimeFunctions } from "pino";

type Sink = (line: string) => void;

// pino-pretty is a development dependency, so it is only loaded when asked
// for. Where it is not installed (a production image) the lines stay JSON.
async function loadPretty() {
  if (process.env.LOG_FORMAT !== "pretty") return null;
  try {
    const { default: pinoPretty } = await import("pino-pretty");
    return pinoPretty({
      colorize: true,
      translateTime: "SYS:HH:MM:ss",
      ignore: "pid,hostname",
      singleLine: true,
    });
  } catch {
    prettyMissing = true;
    return null;
  }
}

let prettyMissing = false;
const pretty = await loadPretty();

const defaultSink: Sink = pretty
  ? (line) => void pretty.write(line)
  : (line) => void process.stdout.write(line);

let sink = defaultSink;

// Fields that must never reach a log, wherever they appear in an object
// that is logged. The request logger leaves out headers altogether, so
// tokens and cookies are not logged in the first place.
const REDACTED = [
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "apiKey",
  "authorization",
  "cookie",
].flatMap((field) => [field, `*.${field}`]);

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    // No pid and host name on every line
    base: null,
    timestamp: stdTimeFunctions.isoTime,
    redact: { paths: REDACTED, censor: "[hidden]" },
  },
  { write: (line: string) => sink(line) },
);

if (prettyMissing) {
  logger.warn(
    "LOG_FORMAT=pretty needs pino-pretty, which is not installed; writing JSON",
  );
}

// A logger whose lines all carry the part of the app they come from
export function moduleLogger(module: string) {
  return logger.child({ module });
}

// For tests: where the log lines go. null puts back the default.
export function setLogSink(next: Sink | null): void {
  sink = next ?? defaultSink;
}

import { afterEach, beforeEach } from "vitest";
import { setLogSink } from "../../src/config/logger.js";

export interface LogLine {
  level: number;
  msg?: string;
  [field: string]: unknown;
}

// pino's numbers for the levels
export const LEVELS = { info: 30, warn: 40, error: 50, fatal: 60 } as const;

// Collects the app's log lines in each test of the file. raw holds the
// lines as written, to check that something never appears in them.
export function useLogs() {
  const logs = {
    raw: [] as string[],
    get lines(): LogLine[] {
      return logs.raw.map((line) => JSON.parse(line) as LogLine);
    },
  };

  beforeEach(() => {
    logs.raw.length = 0;
    setLogSink((line) => {
      logs.raw.push(line);
    });
  });

  afterEach(() => {
    setLogSink(() => {});
  });

  return logs;
}

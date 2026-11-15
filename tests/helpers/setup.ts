// Runs before every test file.
import { afterAll, beforeEach } from "vitest";
import { sequelize } from "../../src/config/database.js";
import { setLogSink } from "../../src/config/logger.js";
import { resetAlerts } from "../../src/services/alertService.js";

// Logs are not written during tests; tests that check them use useLogs()
setLogSink(() => {});

// Every test starts with empty tables, so tests cannot affect each other
beforeEach(async () => {
  await sequelize.truncate({ cascade: true, restartIdentity: true });
  resetAlerts();
});

// Close the connection pool so Vitest can exit cleanly
afterAll(async () => {
  await sequelize.close();
});

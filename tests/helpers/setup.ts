// Runs before every test file.
import { afterAll, beforeEach } from "vitest";
import { sequelize } from "../../src/config/database.js";

// Every test starts with empty tables, so tests cannot affect each other
beforeEach(async () => {
  await sequelize.truncate({ cascade: true, restartIdentity: true });
});

// Close the connection pool so Vitest can exit cleanly
afterAll(async () => {
  await sequelize.close();
});

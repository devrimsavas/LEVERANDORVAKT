import { Umzug, SequelizeStorage } from "umzug";
import { sequelize } from "./database.js";
import { moduleLogger } from "./logger.js";

const log = moduleLogger("migrations");

// Runs the compiled migration files in dist/migrations in name order.
// Applied migrations are recorded in the "migrations" table.
export const migrator = new Umzug({
  migrations: { glob: "dist/migrations/*.js" },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: "migrations" }),
  logger: log,
});

// Applies pending migrations and logs a short summary.
export async function runMigrations() {
  const executed = await migrator.up();

  if (executed.length === 0) {
    log.info("Migrations: database is up to date");
  } else {
    log.info(`Migrations: applied ${executed.map((m) => m.name).join(", ")}`);
  }
}

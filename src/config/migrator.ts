import { Umzug, SequelizeStorage } from "umzug";
import { sequelize } from "./database.js";

// Runs the compiled migration files in dist/migrations in name order.
// Applied migrations are recorded in the "migrations" table.
export const migrator = new Umzug({
  migrations: { glob: "dist/migrations/*.js" },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: "migrations" }),
  logger: console,
});

// Applies pending migrations and logs a short summary.
export async function runMigrations() {
  const executed = await migrator.up();

  if (executed.length === 0) {
    console.log("Migrations: database is up to date");
  } else {
    console.log(
      `Migrations: applied ${executed.map((m) => m.name).join(", ")}`,
    );
  }
}

// Runs once before all tests: brings the test database schema up to date.
// Migrations are read from dist/, so the project is compiled first (npm run pretest).
export default async function setup() {
  const { sequelize } = await import("../../src/config/database.js");
  const { migrator } = await import("../../src/config/migrator.js");
  await migrator.up();
  await sequelize.close();
}

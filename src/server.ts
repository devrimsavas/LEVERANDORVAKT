//server.ts
// Entry point: loads .env, connects to the database, runs migrations,
// starts the HTTP server and the change detection job.
import "dotenv/config";
import app from "./app.js";
import { sequelize } from "./config/database.js";
import { runMigrations } from "./config/migrator.js";
import { ensureAdmin } from "./config/ensureAdmin.js";
import { startChangeDetectionJob } from "./jobs/changeDetectionJob.js";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    //DB connection
    await sequelize.authenticate();
    console.log("Database connected");
    //migrations
    await runMigrations();
    await ensureAdmin();
    //listen port
    app.listen(PORT, () => {
      console.log(`listening at ${PORT}`);
    });
    //change detection
    startChangeDetectionJob();
  } catch (error: any) {
    console.error(`Error ${error.message}`);
    process.exit(1);
  }
};

startServer();

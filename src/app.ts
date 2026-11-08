//app.ts
import "dotenv/config";
import express from "express";
const PORT = process.env.PORT || 3000;
import { sequelize } from "./config/database.js";
//swagger
import swaggerUi from "swagger-ui-express";
import { existsSync, readFileSync } from "node:fs";
//migrator
import { runMigrations } from "./config/migrator.js";
//path
import path from "node:path";
//routes
import indexRouter from "./routes/index.js";
//companies router
import companiesRouter from "./routes/companies.js";
//auth router
import authRouter from "./routes/auth.js";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//public
app.use(express.static(path.join(import.meta.dirname, "public")));

//routes
app.use("/", indexRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/auth", authRouter);

//swagger docs
const swaggerPath = path.join(process.cwd(), "swagger_output.json");

if (existsSync(swaggerPath)) {
  const swaggerDocument = JSON.parse(readFileSync(swaggerPath, "utf-8"));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} else {
  console.warn(
    "swagger_output.json not found. Run 'npm run swagger' to generate API docs.",
  );
}

const mainApp = async () => {
  try {
    //DB connection
    await sequelize.authenticate();
    console.log("Database connected");
    //migrator
    await runMigrations();
    //listen port
    app.listen(PORT, async () => {
      console.log(`listening at ${PORT}`);
    });
  } catch (error: any) {
    console.log(`Error ${error.message}`);
    process.exit(1);
  }
};

mainApp();

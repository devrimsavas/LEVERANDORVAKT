//app.ts
// The Express application: middleware, routes and API docs.
// It does not connect to the database or listen on a port;
// that happens in server.ts, so tests can import the app safely.
import express from "express";
//swagger
import swaggerUi from "swagger-ui-express";
import { existsSync, readFileSync } from "node:fs";
//path
import path from "node:path";
//routes
import indexRouter from "./routes/index.js";
//companies router
import companiesRouter from "./routes/companies.js";
//auth router
import authRouter from "./routes/auth.js";
//watchlist router
import watchlistRouter from "./routes/watchlist.js";
//notifications router
import notificationsRouter from "./routes/notifications.js";
//admin router
import adminRouter from "./routes/admin.js";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//public
app.use(express.static(path.join(import.meta.dirname, "public")));

//routes
app.use("/", indexRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/auth", authRouter);
app.use("/api/watchlist", watchlistRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/admin", adminRouter);

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

export default app;
//app.ts
// The Express application: middleware, routes and API docs.
// It does not connect to the database or listen on a port;
// that happens in server.ts, so tests can import the app safely.
import express from "express";
import helmet from "helmet";
import { apiLimit } from "./middlewares/rateLimits.js";
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
//assistant router
import assistantRouter from "./routes/assistant.js";
//trends router
import trendsRouter from "./routes/trends.js";

const app = express();

// The proxies in front of the API whose X-Forwarded-For header is trusted
// for the client's address (req.ip), which the rate limits count by. The
// default trusts this machine and private networks: the web app on the
// same machine or in the same Docker network. A hosting platform may need
// a number of hops instead, e.g. TRUST_PROXY=1. A request straight from
// the internet is never trusted, so it cannot pretend to be someone else.
const trustProxy =
  process.env.TRUST_PROXY ?? "loopback, linklocal, uniquelocal";
app.set(
  "trust proxy",
  /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
);

// Security headers. The API answers with JSON; the content security policy
// still allows what the Swagger UI at /api/docs needs.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
        // HTTPS is enforced by the HSTS header instead, so the docs also
        // work over plain http://localhost
        "upgrade-insecure-requests": null,
      },
    },
  }),
);

app.use("/api", apiLimit);
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
app.use("/api/assistant", assistantRouter);
app.use("/api/trends", trendsRouter);

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

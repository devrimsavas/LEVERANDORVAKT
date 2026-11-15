import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "../config/logger.js";

// A request id that callers may send, such as the web app's id for the page
// request that made the call. Anything else gets a new id.
const REQUEST_ID = /^[A-Za-z0-9._-]{8,100}$/;

// Logs one line per request when the answer is sent: method, path, status
// and time taken, with the request id and the logged-in user's public id.
// Server errors are logged as errors. The id is sent back in X-Request-Id,
// and req.log is a logger whose lines all carry it. Headers and bodies are
// never logged, so tokens, cookies and passwords stay out of the logs.
export const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const incoming = req.headers["x-request-id"];
    const id =
      typeof incoming === "string" && REQUEST_ID.test(incoming)
        ? incoming
        : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  // Read again when the answer is sent, after requireAuth has set req.auth
  customProps: (req) => {
    const { auth } = req as Express.Request;
    return auth
      ? { requestId: req.id, userId: auth.userId }
      : { requestId: req.id };
  },
  customLogLevel: (_req, res, error) =>
    error || res.statusCode >= 500 ? "error" : "info",
  customSuccessMessage: (req, res, time) =>
    `${req.method} ${pathOf(req)} ${res.statusCode} ${Math.round(time)} ms`,
  customErrorMessage: (req, res) =>
    `${req.method} ${pathOf(req)} ${res.statusCode} failed`,
  // The documentation's own files are not worth a line each
  autoLogging: { ignore: (req) => (req.url ?? "").startsWith("/api/docs") },
  // The request and response objects themselves are not logged
  serializers: {
    req: () => undefined,
    res: () => undefined,
  },
});

// The full path, without the query string, which may hold search words.
// Express shortens req.url inside a router; originalUrl keeps the whole one.
function pathOf(req: {
  url?: string | undefined;
  originalUrl?: string | undefined;
}): string {
  return (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
}

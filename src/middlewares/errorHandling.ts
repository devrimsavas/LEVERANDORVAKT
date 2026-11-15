import type { NextFunction, Request, Response } from "express";
import { recordServerError } from "../services/alertService.js";

// Emails the admin about server errors (500), whichever route answered
// with one. The alert service keeps it to one email an hour.
export function alertOnServerErrors(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.on("finish", () => {
    if (res.statusCode === 500) {
      void recordServerError({
        method: req.method,
        path: req.originalUrl.split("?")[0] ?? req.originalUrl,
        requestId: String(req.id),
      });
    }
  });
  next();
}

// The last stop for errors no route handled: a body that is not valid JSON
// gets its 400, anything else is logged and answered with a JSON 500
// instead of Express's HTML error page.
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
      ? error.status
      : 500;
  if (status === 500) {
    req.log.error({ err: error }, "Unhandled error");
    res.status(500).json({ error: "Something went wrong" });
    return;
  }
  res.status(status).json({
    error: status === 400 ? "The request body is not valid" : "Bad request",
  });
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Request, Response } from "express";
import app from "../src/app.js";
import { logger } from "../src/config/logger.js";
import { User } from "../src/models/User.js";
import { errorHandler } from "../src/middlewares/errorHandling.js";
import { runChangeDetectionOnce } from "../src/jobs/changeDetectionJob.js";
import { runEmailsOnce } from "../src/jobs/emailJob.js";
import {
  recordJobRun,
  recordServerError,
} from "../src/services/alertService.js";
import { lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, useFakeBrreg } from "./helpers/fakeBrreg.js";
import { FAKE_WEB_APP_URL, useFakeEmail } from "./helpers/fakeEmail.js";
import { LEVELS, useLogs } from "./helpers/logs.js";

const brreg = useFakeBrreg();
const email = useFakeEmail(brreg);
const logs = useLogs();

const ADMIN = "admin@leverandorvakt.no";
const ALERTS = "alerts@leverandorvakt.no";

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAIL", ADMIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const requestLines = () =>
  logs.lines.filter((line) => typeof line.requestId === "string");

// Makes the next session check fail as if the database were down
function failNextSessionCheck() {
  vi.spyOn(User, "findOne").mockRejectedValueOnce(
    new Error("The database is down"),
  );
}

// Makes the Brønnøysund update feed answer 503
function breakTheFeed() {
  brreg.extraHandlers.unshift((url) =>
    url.pathname.endsWith("/oppdateringer/enheter")
      ? new Response(null, { status: 503, statusText: "Service Unavailable" })
      : null,
  );
}

describe("request logging", () => {
  it("writes one line per request with its id, the user and the time taken", async () => {
    const { auth } = await registerAndLogin(lukas);
    const user = await User.findOne({
      where: { email: lukas.email },
      rejectOnEmpty: true,
    });
    logs.raw.length = 0;

    const res = await request(app).get("/api/auth/me").set(auth);

    const id = res.headers["x-request-id"];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const [line] = requestLines();
    expect(requestLines()).toHaveLength(1);
    expect(line).toMatchObject({
      level: LEVELS.info,
      requestId: id,
      userId: user.publicId,
      responseTime: expect.any(Number),
    });
    expect(line!.msg).toMatch(/^GET \/api\/auth\/me 200 \d+ ms$/);
    expect(new Date(line!.time as string).toISOString()).toBe(line!.time);
  });

  it("keeps the request id the web app sends, and replaces one that is not safe", async () => {
    const kept = await request(app)
      .get("/api/companies/912345678")
      .set("X-Request-Id", "web-1234abcd");
    const replaced = await request(app)
      .get("/api/companies/912345678")
      .set("X-Request-Id", "bad id <script>");

    expect(kept.headers["x-request-id"]).toBe("web-1234abcd");
    expect(replaced.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestLines().map((line) => line.requestId)).toEqual([
      "web-1234abcd",
      replaced.headers["x-request-id"],
    ]);
  });

  it("never writes passwords, tokens or search words", async () => {
    await registerAndLogin(lukas);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: lukas.email, password: lukas.password });
    await request(app)
      .post("/api/auth/login")
      .send({ email: lukas.email, password: "WrongGuess2026" });
    await request(app).get("/api/companies/search?name=secretsearchword");

    const all = logs.raw.join("");
    expect(all).not.toContain(lukas.password);
    expect(all).not.toContain("WrongGuess2026");
    expect(all).not.toContain(login.body.token);
    expect(all).not.toContain("secretsearchword");
    expect(all).toContain("POST /api/auth/login 401");
    expect(all).toContain("GET /api/companies/search 200");
  });

  it("hides secret fields in anything logged", () => {
    logger.info(
      {
        password: "a",
        body: { password: "b", token: "c", newPassword: "d" },
        headers: { authorization: "Bearer e", cookie: "session=f" },
      },
      "Something",
    );

    const [line] = logs.lines;
    expect(line).toMatchObject({
      password: "[hidden]",
      body: {
        password: "[hidden]",
        token: "[hidden]",
        newPassword: "[hidden]",
      },
      headers: { authorization: "[hidden]", cookie: "[hidden]" },
    });
  });

  it("logs a server error with the error and the request id", async () => {
    const { auth } = await registerAndLogin(lukas);
    failNextSessionCheck();

    const res = await request(app).get("/api/auth/me").set(auth);

    expect(res.status).toBe(500);
    const id = res.headers["x-request-id"];
    const errors = logs.lines.filter((line) => line.level === LEVELS.error);
    expect(errors).toEqual([
      expect.objectContaining({
        requestId: id,
        msg: "Request failed",
        err: expect.objectContaining({ message: "The database is down" }),
      }),
      expect.objectContaining({
        requestId: id,
        msg: "GET /api/auth/me 500 failed",
      }),
    ]);
  });
});

describe("errors no route handled", () => {
  it("answer a body that is not JSON with a JSON 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "The request body is not valid" });
  });

  it("answer anything else with a JSON 500, and log it", () => {
    const log = { error: vi.fn() };
    const res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const error = new Error("Something broke");

    errorHandler(
      error,
      { log } as unknown as Request,
      res as unknown as Response,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Something went wrong" });
    expect(log.error).toHaveBeenCalledWith({ err: error }, "Unhandled error");
  });
});

describe("server error alerts", () => {
  it("email the admin about a 500, with the request id to look for", async () => {
    const { auth } = await registerAndLogin(lukas);
    failNextSessionCheck();

    const res = await request(app).get("/api/auth/me").set(auth);

    await vi.waitFor(() => expect(email.sent).toHaveLength(1));
    const [alert] = email.sent;
    expect(alert!.to).toEqual([ADMIN]);
    expect(alert!.subject).toBe(
      "Leverandørvakt: the API answered with a server error",
    );
    expect(alert!.text).toContain("GET /api/auth/me answered with 500");
    expect(alert!.text).toContain(`Request id: ${res.headers["x-request-id"]}`);
    expect(alert!.text).toContain(`${FAKE_WEB_APP_URL}/admin`);
  });

  it("go to ALERT_EMAIL when it is set", async () => {
    vi.stubEnv("ALERT_EMAIL", ALERTS);

    await recordServerError({ method: "GET", path: "/x", requestId: "r1" });

    expect(email.sent[0]!.to).toEqual([ALERTS]);
  });

  it("come at most once an hour, and count the errors in between", async () => {
    const start = new Date("2026-11-16T10:00:00Z");
    const at = (minutes: number) =>
      new Date(start.getTime() + minutes * 60_000);

    await recordServerError(
      { method: "GET", path: "/a", requestId: "r1" },
      start,
    );
    await recordServerError(
      { method: "GET", path: "/b", requestId: "r2" },
      at(10),
    );
    await recordServerError(
      { method: "GET", path: "/c", requestId: "r3" },
      at(59),
    );
    expect(email.sent).toHaveLength(1);

    await recordServerError(
      { method: "POST", path: "/d", requestId: "r4" },
      at(61),
    );

    expect(email.sent).toHaveLength(2);
    expect(email.sent[1]!.text).toContain("POST /d answered with 500");
    expect(email.sent[1]!.text).toContain(
      "There were 2 more server errors since the previous email.",
    );
  });

  it("are only logged when there is no address to send them to", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");

    await recordServerError({ method: "GET", path: "/x", requestId: "r1" });

    expect(email.sent).toHaveLength(0);
    expect(logs.lines).toContainEqual(
      expect.objectContaining({
        level: LEVELS.warn,
        module: "alerts",
        msg: "Alert not emailed: no ALERT_EMAIL or ADMIN_EMAIL",
      }),
    );
  });
});

describe("job alerts", () => {
  it("email the admin when a job fails three runs in a row, once, and when it works again", async () => {
    breakTheFeed();

    for (let run = 1; run <= 4; run += 1) {
      await expect(runChangeDetectionOnce()).rejects.toThrow();
    }

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.subject).toBe(
      "Leverandørvakt: Change detection has failed 3 times in a row",
    );
    expect(email.sent[0]!.text).toContain("The last problem:");

    brreg.extraHandlers.shift();
    await runChangeDetectionOnce();

    expect(email.sent).toHaveLength(2);
    expect(email.sent[1]!.subject).toBe(
      "Leverandørvakt: Change detection works again",
    );
    expect(email.sent[1]!.text).toContain("after 4 failed runs in a row");
  });

  it("start counting again after a run that works", async () => {
    await recordJobRun("accountsCheck", "Brreg is down");
    await recordJobRun("accountsCheck", "Brreg is down");
    await recordJobRun("accountsCheck", null);
    await recordJobRun("accountsCheck", "Brreg is down");
    await recordJobRun("accountsCheck", "Brreg is down");

    expect(email.sent).toHaveLength(0);
  });

  it("count a run where companies could not be checked as failed", async () => {
    brreg.setActive(brregEnhet("912345678", "ALTA TOURS AS"));
    const { auth } = await registerAndLogin(lukas);
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: "912345678" })
      .expect(201);
    await runChangeDetectionOnce();
    brreg.setError("912345678", 503);

    for (let run = 1; run <= 3; run += 1) {
      brreg.addUpdate("912345678");
      const summary = await runChangeDetectionOnce();
      expect(summary?.failedCompanies).toBe(1);
    }

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.text).toContain(
      "The last problem: 1 company could not be checked.",
    );
  });

  it("follow ALERT_AFTER_FAILURES, where 0 turns them off", async () => {
    vi.stubEnv("ALERT_AFTER_FAILURES", "1");
    await recordJobRun("emails", "Resend is down");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.subject).toBe(
      "Leverandørvakt: Sending notification emails has failed 1 times in a row",
    );

    vi.stubEnv("ALERT_AFTER_FAILURES", "0");
    for (let run = 1; run <= 5; run += 1) {
      await recordJobRun("changeDetection", "Brreg is down");
    }
    expect(email.sent).toHaveLength(1);
  });

  it("log an alert that could not be sent, without failing the job", async () => {
    vi.stubEnv("ALERT_AFTER_FAILURES", "1");
    email.failure = { status: 500, message: "Down" };

    await expect(runEmailsOnce()).resolves.not.toBeNull();
    await recordJobRun("emails", "Resend is down");

    expect(logs.lines).toContainEqual(
      expect.objectContaining({
        level: LEVELS.error,
        module: "alerts",
        msg: "Alert email failed",
      }),
    );
  });
});

import { createHmac, timingSafeEqual } from "node:crypto";
import { Op } from "sequelize";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { CompanyChange } from "../models/CompanyChange.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { getEmailSender } from "./email/emailSender.js";
import { notificationEmail } from "./email/templates.js";
import { getJwtSecret } from "./authService.js";
import { webAppUrl } from "../utils/webAppUrl.js";
import { localHour, startOfLocalDay } from "../utils/localTime.js";
import { moduleLogger } from "../config/logger.js";

const log = moduleLogger("emails");

// Notifications by email. Each user chooses (users.email_notifications):
//   instant  every notification is emailed within minutes
//   daily    one summary each morning; critical changes (such as a
//            bankruptcy) are still emailed at once
//   off      no email
// A notification is emailed at most once: emailed_at is set before the
// email is sent (so two runs cannot both take it) and cleared again if
// sending fails, so a later run tries again. A notification the user has
// already read in the app is marked as handled without an email.

// Older notifications are not emailed any more, so a long Resend outage
// does not end in a flood of old news
export const INSTANT_WINDOW_HOURS = 48;
export const DIGEST_WINDOW_DAYS = 7;

const DEFAULT_DIGEST_HOUR = 7;

export interface EmailRunSummary {
  usersEmailed: number;
  notificationsEmailed: number;
  failedUsers: number;
}

function digestHour(): number {
  const hour = Number(process.env.EMAIL_DIGEST_HOUR);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23
    ? hour
    : DEFAULT_DIGEST_HOUR;
}

// ---- Unsubscribe links ----

// A link that turns the emails off without logging in. It holds the user's
// public id and a signature made with the server's secret, so it cannot be
// made for another user. It does not expire, like unsubscribe links usually.
function sign(publicId: string): string {
  return createHmac("sha256", getJwtSecret())
    .update(`unsubscribe:${publicId}`)
    .digest("base64url");
}

export function unsubscribeToken(publicId: string): string {
  return `${Buffer.from(publicId).toString("base64url")}.${sign(publicId)}`;
}

function publicIdFromToken(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 300) return null;
  const [encodedId, signature] = token.split(".");
  if (!encodedId || !signature) return null;
  const publicId = Buffer.from(encodedId, "base64url").toString("utf8");
  const expected = Buffer.from(sign(publicId));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given)
    ? publicId
    : null;
}

export class InvalidUnsubscribeTokenError extends Error {}

// Turns the emails off for the user the link was made for
export async function unsubscribe(token: unknown): Promise<void> {
  const publicId = publicIdFromToken(token);
  const user = publicId ? await User.findOne({ where: { publicId } }) : null;
  if (!user) {
    throw new InvalidUnsubscribeTokenError("This link is not valid");
  }
  if (user.emailNotifications !== "off") {
    user.emailNotifications = "off";
    await user.save();
  }
}

// ---- Sending ----

const includeChange = {
  model: CompanyChange,
  include: [{ model: CompanyRecord, attributes: ["orgNumber", "name"] }],
};

// Marks the notifications as emailed, and returns the ids this run got:
// another run may have taken some of them already
async function claim(ids: number[], now: Date): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const [, rows] = await Notification.update(
    { emailedAt: now },
    { where: { id: ids, emailedAt: null }, returning: true },
  );
  return new Set(rows.map((row) => row.id));
}

async function release(ids: number[]): Promise<void> {
  await Notification.update({ emailedAt: null }, { where: { id: ids } });
}

// Sends one email with the user's notifications. Returns false if it
// could not be sent; the caller then releases them for a later run.
async function sendTo(
  user: User,
  notifications: Notification[],
  kind: "instant" | "digest",
): Promise<boolean> {
  const base = webAppUrl();
  const token = encodeURIComponent(unsubscribeToken(user.publicId));
  try {
    await getEmailSender().send(
      notificationEmail({
        to: user.email,
        firstName: user.firstName,
        language: user.language,
        kind,
        webAppUrl: base,
        unsubscribeUrl: `${base}/unsubscribe?token=${token}`,
        oneClickUnsubscribeUrl: `${base}/unsubscribe/one-click?token=${token}`,
        items: notifications.map((notification) => ({
          orgNumber: notification.change.company.orgNumber,
          companyName: notification.change.company.name,
          field: notification.change.field,
          oldValue: notification.change.oldValue,
          newValue: notification.change.newValue,
          severity: notification.change.severity,
        })),
      }),
    );
    return true;
  } catch (error) {
    // The address is not logged, only the user's public id
    log.error({ err: error }, `Email to user ${user.publicId} failed:`);
    return false;
  }
}

// Claims the notifications, emails the unread ones and releases them all
// again if sending fails
async function deliver(
  user: User,
  notifications: Notification[],
  kind: "instant" | "digest",
  now: Date,
  summary: EmailRunSummary,
): Promise<boolean> {
  const claimed = await claim(
    notifications.map((n) => n.id),
    now,
  );
  const unread = notifications.filter(
    (n) => claimed.has(n.id) && n.readAt === null,
  );
  if (unread.length === 0) return true;

  if (await sendTo(user, unread, kind)) {
    summary.usersEmailed += 1;
    summary.notificationsEmailed += unread.length;
    return true;
  }
  await release([...claimed]);
  summary.failedUsers += 1;
  return false;
}

function groupByUser(
  notifications: Notification[],
): Map<number, Notification[]> {
  const groups = new Map<number, Notification[]>();
  for (const notification of notifications) {
    const list = groups.get(notification.userId) ?? [];
    list.push(notification);
    groups.set(notification.userId, list);
  }
  return groups;
}

// Notifications still to be emailed: not emailed, not read in the app, recent
// enough and for users who want emails. For the admin page.
export async function countWaitingEmails(now = new Date()): Promise<number> {
  return Notification.count({
    where: {
      emailedAt: null,
      readAt: null,
      createdAt: {
        [Op.gte]: new Date(now.getTime() - DIGEST_WINDOW_DAYS * 24 * 3600_000),
      },
    },
    include: [
      {
        model: User,
        attributes: [],
        where: { emailNotifications: { [Op.ne]: "off" } },
      },
    ],
  });
}

// When a notification was last emailed; null if never
export async function lastEmailedAt(): Promise<Date | null> {
  return (
    (await Notification.max<Date | null, Notification>("emailedAt")) ?? null
  );
}

// Emails what should go at once: everything for "instant" users, critical
// changes for "daily" users. One email per user, however many changes.
export async function sendInstantEmails(
  now = new Date(),
): Promise<EmailRunSummary> {
  const summary = { usersEmailed: 0, notificationsEmailed: 0, failedUsers: 0 };
  const waiting = await Notification.findAll({
    where: {
      emailedAt: null,
      createdAt: {
        [Op.gte]: new Date(now.getTime() - INSTANT_WINDOW_HOURS * 3600_000),
      },
    },
    include: [
      { model: User, where: { emailNotifications: { [Op.ne]: "off" } } },
      includeChange,
    ],
    order: [
      ["createdAt", "ASC"],
      ["id", "ASC"],
    ],
  });
  const due = waiting.filter(
    (n) =>
      n.user.emailNotifications === "instant" ||
      n.change.severity === "critical",
  );

  for (const notifications of groupByUser(due).values()) {
    await deliver(
      notifications[0]!.user,
      notifications,
      "instant",
      now,
      summary,
    );
  }
  return summary;
}

// Sends each "daily" user one summary a day, from EMAIL_DIGEST_HOUR in the
// email time zone, of what has not been emailed yet. force sends it now,
// whatever the hour and even if one was sent today (the admin's button).
export async function sendDailyDigests(
  options: { now?: Date; force?: boolean } = {},
): Promise<EmailRunSummary> {
  const now = options.now ?? new Date();
  const summary = { usersEmailed: 0, notificationsEmailed: 0, failedUsers: 0 };
  if (!options.force && localHour(now) < digestHour()) {
    return summary;
  }

  const users = await User.findAll({
    where: {
      emailNotifications: "daily",
      ...(options.force
        ? {}
        : {
            [Op.or]: [
              { lastDigestAt: null },
              { lastDigestAt: { [Op.lt]: startOfLocalDay(now) } },
            ],
          }),
    },
    order: [["id", "ASC"]],
  });

  for (const user of users) {
    const notifications = await Notification.findAll({
      where: {
        userId: user.id,
        emailedAt: null,
        createdAt: {
          [Op.gte]: new Date(now.getTime() - DIGEST_WINDOW_DAYS * 86400_000),
        },
      },
      include: [includeChange],
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
    });
    const sent = await deliver(user, notifications, "digest", now, summary);
    // A failed summary is tried again at the next run, the same day
    if (sent) {
      user.lastDigestAt = now;
      await user.save();
    }
  }
  return summary;
}

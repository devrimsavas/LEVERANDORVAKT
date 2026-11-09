import type { Transaction } from "sequelize";
import { Notification } from "../models/Notification.js";
import { WatchlistEntry } from "../models/WatchlistEntry.js";
import { CompanyChange } from "../models/CompanyChange.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { getInternalUserId } from "./userService.js";
import { toChangeItem } from "../mappers/changeMapper.js";
import type { ChangeItem } from "../mappers/changeMapper.js";
import { toOffset, toPaginated } from "../utils/pagination.js";
import type { Pagination, Paginated } from "../utils/pagination.js";

// Creates one notification per change for every user who follows the company.
// Runs inside the caller's transaction, so changes and notifications are saved together.
// Returns the number of notifications created.
export async function notifyFollowers(
  companyId: number,
  changes: CompanyChange[],
  transaction: Transaction,
): Promise<number> {
  if (changes.length === 0) {
    return 0;
  }

  const followers = await WatchlistEntry.findAll({
    where: { companyId },
    attributes: ["userId"],
    transaction,
  });

  if (followers.length === 0) {
    return 0;
  }

  const rows = followers.flatMap((follower) =>
    changes.map((change) => ({
      userId: follower.userId,
      companyChangeId: change.id,
    })),
  );

  await Notification.bulkCreate(rows, { transaction });

  return rows.length;
}

export class NotificationNotFoundError extends Error {}

// One notification, as sent to clients.
export interface NotificationItem {
  id: string;
  readAt: Date | null;
  createdAt: Date;
  company: {
    orgNumber: string;
    name: string;
  };
  change: ChangeItem;
}

export interface NotificationFilter {
  unreadOnly: boolean;
}

// Loads the change and its company together with each notification
const includeChangeAndCompany = [
  {
    model: CompanyChange,
    include: [{ model: CompanyRecord, attributes: ["orgNumber", "name"] }],
  },
];

function toNotificationItem(notification: Notification): NotificationItem {
  return {
    id: notification.publicId,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    company: {
      orgNumber: notification.change.company.orgNumber,
      name: notification.change.company.name,
    },
    change: toChangeItem(notification.change),
  };
}

// Lists the user's notifications, newest first.
export async function getNotifications(
  userPublicId: string,
  filter: NotificationFilter,
  pagination: Pagination,
): Promise<Paginated<NotificationItem>> {
  const userId = await getInternalUserId(userPublicId);

  const where = filter.unreadOnly ? { userId, readAt: null } : { userId };

  const { rows, count } = await Notification.findAndCountAll({
    where,
    include: includeChangeAndCompany,
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: pagination.pageSize,
    offset: toOffset(pagination),
  });

  return toPaginated(rows.map(toNotificationItem), count, pagination);
}

// Number of unread notifications, e.g. for a badge in the frontend.
export async function getUnreadCount(userPublicId: string): Promise<number> {
  const userId = await getInternalUserId(userPublicId);
  return Notification.count({ where: { userId, readAt: null } });
}

// Marks one of the user's notifications as read.
// Marking an already read notification keeps the original read time.
export async function markAsRead(
  userPublicId: string,
  notificationPublicId: string,
): Promise<NotificationItem> {
  const userId = await getInternalUserId(userPublicId);

  // Filtering by userId means users cannot touch each other's notifications
  const notification = await Notification.findOne({
    where: { publicId: notificationPublicId, userId },
    include: includeChangeAndCompany,
  });

  if (!notification) {
    throw new NotificationNotFoundError("Notification not found");
  }

  if (notification.readAt === null) {
    notification.readAt = new Date();
    await notification.save();
  }

  return toNotificationItem(notification);
}

// Marks all of the user's unread notifications as read.
// Returns how many notifications were changed.
export async function markAllAsRead(userPublicId: string): Promise<number> {
  const userId = await getInternalUserId(userPublicId);

  const [updated] = await Notification.update(
    { readAt: new Date() },
    { where: { userId, readAt: null } },
  );

  return updated;
}

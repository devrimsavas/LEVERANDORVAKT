import bcrypt from "bcryptjs";
import { sequelize } from "../config/database.js";
import { User } from "../models/User.js";
import { WatchlistEntry } from "../models/WatchlistEntry.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { Notification } from "../models/Notification.js";
import { CompanyChange } from "../models/CompanyChange.js";
import { AssistantConversation } from "../models/AssistantConversation.js";
import { AssistantMessage } from "../models/AssistantMessage.js";
import { AssistantUsage } from "../models/AssistantUsage.js";
import {
  InvalidCredentialsError,
  issueToken,
  SALT_ROUNDS,
} from "./authService.js";

// The user's own account: changing the password, downloading every piece
// of data stored about them and deleting the account (the GDPR rights of
// access, portability and erasure).

export class UserNotFoundError extends Error {}
export class LastAdminError extends Error {}

async function findUser(userPublicId: string): Promise<User> {
  const user = await User.findOne({ where: { publicId: userPublicId } });
  if (!user) {
    throw new UserNotFoundError("User not found");
  }
  return user;
}

async function checkPassword(user: User, password: unknown): Promise<void> {
  const matches =
    typeof password === "string" &&
    (await bcrypt.compare(password, user.passwordHash));
  if (!matches) {
    throw new InvalidCredentialsError("The password is wrong");
  }
}

// Sets a new password after checking the current one. Every session ends,
// this one too, so a new token is returned for the device that asked.
export async function changePassword(
  userPublicId: string,
  currentPassword: unknown,
  newPassword: string,
): Promise<{ token: string }> {
  const user = await findUser(userPublicId);
  await checkPassword(user, currentPassword);
  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.passwordChangedAt = new Date();
  await user.save();
  return { token: issueToken(user) };
}

const createdAt = (row: { get(key: string): unknown }) =>
  row.get("createdAt") as Date;

// Everything stored about the user, in one JSON document they can read or
// take elsewhere. Internal database ids and the password hash are left
// out; the public ids are the ones the API uses.
export async function exportUserData(userPublicId: string) {
  const user = await findUser(userPublicId);

  const [watchlist, notifications, conversations, usage] = await Promise.all([
    WatchlistEntry.findAll({
      where: { userId: user.id },
      include: [CompanyRecord],
      order: [["createdAt", "ASC"]],
    }),
    Notification.findAll({
      where: { userId: user.id },
      include: [{ model: CompanyChange, include: [CompanyRecord] }],
      order: [["createdAt", "ASC"]],
    }),
    AssistantConversation.findAll({
      where: { userId: user.id },
      order: [["createdAt", "ASC"]],
    }),
    AssistantUsage.findAll({
      where: { userId: user.id },
      order: [["createdAt", "ASC"]],
    }),
  ]);
  const messages = await AssistantMessage.findAll({
    where: { conversationId: conversations.map((c) => c.id) },
    order: [
      ["createdAt", "ASC"],
      ["id", "ASC"],
    ],
  });

  return {
    format: "leverandorvakt-export/1",
    exportedAt: new Date(),
    user: {
      userId: user.publicId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      createdAt: createdAt(user),
      lastLoginAt: user.lastLoginAt,
      passwordChangedAt: user.passwordChangedAt,
      gettingStartedClosedAt: user.onboardingDismissedAt,
    },
    watchlist: watchlist.map((entry) => ({
      orgNumber: entry.company.orgNumber,
      name: entry.company.name,
      note: entry.note,
      followedSince: createdAt(entry),
    })),
    notifications: notifications.map((notification) => ({
      notificationId: notification.publicId,
      orgNumber: notification.change.company.orgNumber,
      companyName: notification.change.company.name,
      field: notification.change.field,
      oldValue: notification.change.oldValue,
      newValue: notification.change.newValue,
      severity: notification.change.severity,
      detectedAt: notification.change.detectedAt,
      createdAt: createdAt(notification),
      readAt: notification.readAt,
    })),
    assistant: {
      conversations: conversations.map((conversation) => ({
        conversationId: conversation.publicId,
        title: conversation.title,
        createdAt: createdAt(conversation),
        messages: messages
          .filter((message) => message.conversationId === conversation.id)
          .map((message) => ({
            role: message.role,
            content: message.content,
            toolsUsed: message.toolsUsed,
            createdAt: createdAt(message),
          })),
      })),
      // When each question was asked, kept for the daily limit even when
      // the conversation is deleted
      questionsAskedAt: usage.map(createdAt),
    },
  };
}

// Deletes the account after checking the password. The database deletes
// everything that belongs to the user with it (watchlist and notes,
// notifications, conversations, question counts, reset links). Companies
// stay: they are register data shared by everyone who follows them.
// The last admin cannot be deleted, so the system always has one.
export async function deleteAccount(
  userPublicId: string,
  password: unknown,
): Promise<void> {
  await sequelize.transaction(async (transaction) => {
    const user = await User.findOne({
      where: { publicId: userPublicId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) {
      throw new UserNotFoundError("User not found");
    }
    await checkPassword(user, password);
    if (user.role === "admin") {
      const admins = await User.count({
        where: { role: "admin" },
        transaction,
      });
      if (admins <= 1) {
        throw new LastAdminError("The last admin account cannot be deleted");
      }
    }
    await user.destroy({ transaction });
  });
}

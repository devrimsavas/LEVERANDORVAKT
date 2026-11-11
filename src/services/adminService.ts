import { Op, fn, col } from "sequelize";
import { sequelize } from "../config/database.js";
import { User } from "../models/User.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { WatchlistEntry } from "../models/WatchlistEntry.js";
import { Notification } from "../models/Notification.js";
import { BrregSyncState } from "../models/BrregSyncState.js";
import { AssistantConversation } from "../models/AssistantConversation.js";
import { AssistantUsage } from "../models/AssistantUsage.js";
import { RECHECK_AFTER_HOURS } from "./accountsService.js";
import { createLlmProvider } from "./llm/llmProvider.js";
import { isChangeDetectionRunning } from "../jobs/changeDetectionJob.js";
import { isAccountsCheckRunning } from "../jobs/accountsCheckJob.js";
import { toOffset, toPaginated } from "../utils/pagination.js";
import type { Pagination, Paginated } from "../utils/pagination.js";
import type { UserRole } from "../models/User.js";
import type { RiskLevel } from "../types/risk.js";

const HOUR_MS = 60 * 60 * 1000;

export interface SystemStatus {
  generatedAt: Date;
  changeDetection: {
    running: boolean;
    // false until the first run has recorded the starting points
    initialized: boolean;
    lastRunAt: Date | null;
    lastUpdateId: string | null;
    lastRoleEventId: string | null;
  };
  accountsCheck: {
    running: boolean;
    // The most recent check of any company
    lastCompanyCheckedAt: Date | null;
    // Companies waiting for their next check
    companiesDue: number;
  };
  users: { total: number; admins: number };
  companies: {
    total: number;
    followed: number;
    struckOff: number;
    riskLevels: Record<RiskLevel | "notAssessed", number>;
  };
  watchlistEntries: number;
  notifications: { total: number; unread: number };
  assistant: {
    // Provider and model in use, e.g. "ollama:qwen3.8"; null when turned off
    provider: string | null;
    conversations: number;
    questionsLast24Hours: number;
  };
}

export interface AdminUserItem {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date | null;
  followedCompanies: number;
}

// An overview of the background jobs and the data, for the admin page
export async function getSystemStatus(): Promise<SystemStatus> {
  const now = Date.now();
  const recheckBefore = new Date(now - RECHECK_AFTER_HOURS * HOUR_MS);

  const [
    state,
    lastCompanyCheckedAt,
    companiesDue,
    users,
    admins,
    companies,
    followed,
    struckOff,
    riskRows,
    watchlistEntries,
    notifications,
    unread,
    conversations,
    questions,
  ] = await Promise.all([
    BrregSyncState.findOne(),
    CompanyRecord.max<Date | null, CompanyRecord>("accountsCheckedAt"),
    CompanyRecord.count({
      where: {
        deletedFromRegistryAt: null,
        [Op.or]: [
          { accountsCheckedAt: null },
          { accountsCheckedAt: { [Op.lt]: recheckBefore } },
        ],
      },
    }),
    User.count(),
    User.count({ where: { role: "admin" } }),
    CompanyRecord.count(),
    WatchlistEntry.count({ distinct: true, col: "company_id" }),
    CompanyRecord.count({
      where: { deletedFromRegistryAt: { [Op.ne]: null } },
    }),
    CompanyRecord.findAll({
      attributes: ["riskLevel", [fn("COUNT", col("id")), "count"]],
      group: ["riskLevel"],
      raw: true,
    }) as unknown as Promise<{ riskLevel: RiskLevel | null; count: string }[]>,
    WatchlistEntry.count(),
    Notification.count(),
    Notification.count({ where: { readAt: null } }),
    AssistantConversation.count(),
    AssistantUsage.count({
      where: { createdAt: { [Op.gte]: new Date(now - 24 * HOUR_MS) } },
    }),
  ]);

  const riskLevels = { low: 0, medium: 0, high: 0, notAssessed: 0 };
  for (const row of riskRows) {
    riskLevels[row.riskLevel ?? "notAssessed"] = Number(row.count);
  }

  return {
    generatedAt: new Date(now),
    changeDetection: {
      running: isChangeDetectionRunning(),
      initialized: state !== null,
      lastRunAt: state?.lastRunAt ?? null,
      lastUpdateId: state?.lastUpdateId ?? null,
      lastRoleEventId: state?.lastRoleEventId ?? null,
    },
    accountsCheck: {
      running: isAccountsCheckRunning(),
      lastCompanyCheckedAt: lastCompanyCheckedAt ?? null,
      companiesDue,
    },
    users: { total: users, admins },
    companies: { total: companies, followed, struckOff, riskLevels },
    watchlistEntries,
    notifications: { total: notifications, unread },
    assistant: {
      provider: createLlmProvider()?.name ?? null,
      conversations,
      questionsLast24Hours: questions,
    },
  };
}

// Lists the users, newest first, optionally filtered by name or email.
// For viewing only: roles are never changed through the API.
export async function listUsers(
  pagination: Pagination,
  search: string | null,
): Promise<Paginated<AdminUserItem>> {
  const like = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : null;

  const { rows, count } = await User.findAndCountAll({
    ...(like
      ? {
          where: {
            [Op.or]: [
              { email: { [Op.iLike]: like } },
              { firstName: { [Op.iLike]: like } },
              { lastName: { [Op.iLike]: like } },
            ],
          },
        }
      : {}),
    attributes: {
      include: [
        [
          sequelize.literal(
            `(SELECT COUNT(*) FROM watchlist_entries AS w WHERE w.user_id = "User"."id")`,
          ),
          "followedCompanies",
        ],
      ],
    },
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: pagination.pageSize,
    offset: toOffset(pagination),
  });

  return toPaginated(
    rows.map((user) => ({
      userId: user.publicId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      followedCompanies: Number(user.get("followedCompanies")),
    })),
    count,
    pagination,
  );
}

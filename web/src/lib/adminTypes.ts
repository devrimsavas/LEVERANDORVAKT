import type { RiskLevel } from "./companyTypes";

// The shapes of GET /api/admin/status and GET /api/admin/users

export interface SystemStatus {
  generatedAt: string;
  changeDetection: {
    running: boolean;
    initialized: boolean;
    lastRunAt: string | null;
    lastUpdateId: string | null;
    lastRoleEventId: string | null;
  };
  accountsCheck: {
    running: boolean;
    lastCompanyCheckedAt: string | null;
    companiesDue: number;
  };
  emails: {
    running: boolean;
    // "resend", or "log" when emails are only written to the API's console
    provider: string;
    waiting: number;
    lastSentAt: string | null;
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
    provider: string | null;
    conversations: number;
    questionsLast24Hours: number;
  };
}

export interface AdminUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
  lastLoginAt: string | null;
  followedCompanies: number;
}

export interface AdminUserPage {
  items: AdminUser[];
  page: number;
  totalItems: number;
  totalPages: number;
}

export type JobKind = "changeDetection" | "accountsCheck" | "emails";

export interface JobSummary {
  // Only change detection: true when the first run only set the start
  initialized?: boolean;
  companiesChecked: number;
  changesFound: number;
  failedCompanies: number;
}

// What one run of the emails did (POST /api/admin/emails/run)
export interface EmailRunSummary {
  usersEmailed: number;
  notificationsEmailed: number;
  failedUsers: number;
}

export interface EmailJobSummary {
  instant: EmailRunSummary;
  digest: EmailRunSummary;
}

export type JobResult =
  | { ok: true; summary: JobSummary | EmailJobSummary }
  | { ok: false; error: "running" | "failed" };

export const USERS_PAGE_SIZE = 20;
export const MAX_USER_SEARCH_LENGTH = 100;

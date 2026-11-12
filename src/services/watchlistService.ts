import { literal, Op, UniqueConstraintError } from "sequelize";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { WatchlistEntry } from "../models/WatchlistEntry.js";
import { CompanyChange } from "../models/CompanyChange.js";
import { AnnualAccountsRecord } from "../models/AnnualAccountsRecord.js";
import { getCompany, getCompanyRoles } from "./brregService.js";
import { getInternalUserId } from "./userService.js";
import { checkCompanyAccounts } from "./accountsService.js";
import { getStoredAccounts } from "./storedAccounts.js";
import { assessFollowedCompany, reassessRisk } from "./riskService.js";
import { sequelize } from "../config/database.js";
import { toChangeItem } from "../mappers/changeMapper.js";
import { fromAnnualAccountsRecord } from "../mappers/annualAccountsMapper.js";
import type { ChangeItem } from "../mappers/changeMapper.js";
import { toOffset, toPaginated } from "../utils/pagination.js";
import type { Pagination, Paginated } from "../utils/pagination.js";
import type { Company } from "../types/company.js";
import type { CompanyRoles } from "../types/companyRoles.js";
import type {
  AccountsStatus,
  AnnualAccounts,
} from "../types/annualAccounts.js";
import type { RiskAssessment, RiskLevel } from "../types/risk.js";

export class CompanyNotFoundError extends Error {}
export class AlreadyWatchingError extends Error {}
export class NotWatchingError extends Error {}

// The annual accounts of a company on the watchlist.
// status is null until the accounts have been checked for the first time.
export interface WatchlistAccounts {
  status: AccountsStatus | null;
  // The company's own latest accounts (the full list has its own endpoint)
  latest: AnnualAccounts | null;
}

// The stored risk level of a company on the watchlist; null until assessed.
// The full report has its own endpoint.
export interface WatchlistRisk {
  level: RiskLevel | null;
  score: number | null;
  assessedAt: Date | null;
}

// How the watchlist can be sorted
export type WatchlistSort = "name" | "risk";

// high = 3 ... not assessed = 0, for sorting by risk level
const RISK_LEVEL_RANK = literal(
  `CASE "company"."risk_level" WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END`,
);

// All stored annual accounts of a followed company, newest first
export interface CompanyAccounts {
  status: AccountsStatus | null;
  accounts: AnnualAccounts[];
}

// One company on the user's watchlist, as sent to clients.
export interface WatchlistItem {
  orgNumber: string;
  name: string;
  note: string | null;
  followedSince: Date;
  lastCheckedAt: Date;
  lastChangedAt: Date | null;
  deletedFromRegistryAt: Date | null;
  company: Company;
  roles: CompanyRoles | null;
  accounts: WatchlistAccounts;
  risk: WatchlistRisk;
}

function toWatchlistItem(
  entry: WatchlistEntry,
  latestAccounts: AnnualAccounts | null,
): WatchlistItem {
  const record = entry.company;
  return {
    orgNumber: record.orgNumber,
    name: record.name,
    note: entry.note,
    followedSince: entry.createdAt,
    lastCheckedAt: record.lastCheckedAt,
    lastChangedAt: record.lastChangedAt,
    deletedFromRegistryAt: record.deletedFromRegistryAt,
    company: record.snapshot,
    roles: record.roles,
    accounts: { status: record.accountsStatus, latest: latestAccounts },
    risk: {
      level: record.riskLevel,
      score: record.riskScore,
      assessedAt: record.riskAssessedAt,
    },
  };
}

// The latest accounts of each company, preferring the company's own
// accounts over the group's for the same period
async function latestAccountsByCompany(
  companyIds: number[],
): Promise<Map<number, AnnualAccounts>> {
  const latest = new Map<number, AnnualAccounts>();
  if (companyIds.length === 0) {
    return latest;
  }

  const rows = await AnnualAccountsRecord.findAll({
    where: { companyId: { [Op.in]: companyIds } },
    order: [
      ["periodEnd", "DESC"],
      ["type", "ASC"],
    ],
  });

  for (const row of rows) {
    if (!latest.has(row.companyId)) {
      latest.set(row.companyId, fromAnnualAccountsRecord(row));
    }
  }
  return latest;
}

// Checks the accounts of a company whose accounts were never checked.
// The accounts register may be unavailable or shut down; following a company
// must still work, so a failure is only logged and the daily check retries it.
async function checkAccountsIfNeverChecked(
  record: CompanyRecord,
): Promise<void> {
  if (record.accountsCheckedAt !== null) {
    return;
  }
  try {
    await checkCompanyAccounts(record);
  } catch (error) {
    console.error(`Could not fetch the accounts of ${record.orgNumber}`, error);
  }
}

// Assesses the risk of a newly followed company, as the starting point.
// Following must still work if this fails; the daily check assesses it then.
async function assessRiskIfNeverAssessed(record: CompanyRecord): Promise<void> {
  if (record.riskLevel !== null) {
    return;
  }
  try {
    await sequelize.transaction((transaction) =>
      reassessRisk(record, transaction, { notifyRise: false }),
    );
  } catch (error) {
    console.error(`Could not assess the risk of ${record.orgNumber}`, error);
  }
}

// Returns the stored company, or fetches it and its roles from Brreg
// and stores them the first time anyone follows it.
async function findOrCreateCompanyRecord(
  orgNumber: string,
): Promise<CompanyRecord> {
  const existing = await CompanyRecord.findOne({ where: { orgNumber } });
  if (existing) {
    return existing;
  }

  const company = await getCompany(orgNumber);
  if (!company) {
    throw new CompanyNotFoundError(
      "Company not found in the Brønnøysund Register or struck off",
    );
  }
  const roles = await getCompanyRoles(orgNumber);
  try {
    return await CompanyRecord.create({
      orgNumber: company.orgNumber,
      name: company.name,
      snapshot: company,
      roles,
      lastCheckedAt: new Date(),
    });
  } catch (error) {
    // Another request stored the same company at the same moment
    if (error instanceof UniqueConstraintError) {
      return await CompanyRecord.findOne({
        where: { orgNumber },
        rejectOnEmpty: true,
      });
    }
    throw error;
  }
}

async function findEntry(
  userId: number,
  orgNumber: string,
): Promise<WatchlistEntry> {
  const entry = await WatchlistEntry.findOne({
    where: { userId },
    include: [{ model: CompanyRecord, where: { orgNumber } }],
  });
  if (!entry) {
    throw new NotWatchingError("This company is not on your watchlist");
  }
  return entry;
}

// Lists the user's watchlist, sorted by company name or by risk.
export async function getWatchlist(
  userPublicId: string,
  sort: WatchlistSort = "name",
): Promise<WatchlistItem[]> {
  const userId = await getInternalUserId(userPublicId);

  const entries = await WatchlistEntry.findAll({
    where: { userId },
    include: [CompanyRecord],
    // By risk: highest level first, then highest score, companies not
    // assessed yet last. The level comes first because a critical signal
    // (e.g. bankruptcy) sets the level to high without adding points.
    order:
      sort === "risk"
        ? [
            [RISK_LEVEL_RANK, "DESC"],
            ["company", "riskScore", "DESC NULLS LAST"],
            ["company", "name", "ASC"],
          ]
        : [["company", "name", "ASC"]],
  });

  const latest = await latestAccountsByCompany(
    entries.map((entry) => entry.companyId),
  );

  return entries.map((entry) =>
    toWatchlistItem(entry, latest.get(entry.companyId) ?? null),
  );
}

// One company on the user's watchlist, e.g. to show it on the company page.
// NotWatchingError when the user does not follow it.
export async function getWatchlistItem(
  userPublicId: string,
  orgNumber: string,
): Promise<WatchlistItem> {
  const userId = await getInternalUserId(userPublicId);
  const entry = await findEntry(userId, orgNumber);
  const latest = await latestAccountsByCompany([entry.companyId]);
  return toWatchlistItem(entry, latest.get(entry.companyId) ?? null);
}

// Adds a company to the user's watchlist.
export async function addToWatchlist(
  userPublicId: string,
  orgNumber: string,
  note: string | null,
): Promise<WatchlistItem> {
  const userId = await getInternalUserId(userPublicId);
  const record = await findOrCreateCompanyRecord(orgNumber);

  try {
    const entry = await WatchlistEntry.create({
      userId,
      companyId: record.id,
      note,
    });
    entry.company = record;

    await checkAccountsIfNeverChecked(record);
    await assessRiskIfNeverAssessed(record);
    const latest = await latestAccountsByCompany([record.id]);
    return toWatchlistItem(entry, latest.get(record.id) ?? null);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new AlreadyWatchingError(
        "This company is already on your watchlist",
      );
    }
    throw error;
  }
}

// Replaces the user's note on a followed company. null removes the note.
export async function updateWatchlistNote(
  userPublicId: string,
  orgNumber: string,
  note: string | null,
): Promise<WatchlistItem> {
  const userId = await getInternalUserId(userPublicId);
  const entry = await findEntry(userId, orgNumber);

  entry.note = note;
  await entry.save();

  const latest = await latestAccountsByCompany([entry.companyId]);
  return toWatchlistItem(entry, latest.get(entry.companyId) ?? null);
}

// Removes a company from the user's watchlist.
// The stored company itself is kept, so its change history is not lost.
export async function removeFromWatchlist(
  userPublicId: string,
  orgNumber: string,
): Promise<void> {
  const userId = await getInternalUserId(userPublicId);
  const entry = await findEntry(userId, orgNumber);
  await entry.destroy();
}

// Lists the detected changes of a company on the user's watchlist, newest first.
// Includes changes from before the user started following the company.
export async function getCompanyChanges(
  userPublicId: string,
  orgNumber: string,
  pagination: Pagination,
): Promise<Paginated<ChangeItem>> {
  const userId = await getInternalUserId(userPublicId);
  const entry = await findEntry(userId, orgNumber);

  const { rows, count } = await CompanyChange.findAndCountAll({
    where: { companyId: entry.companyId },
    order: [
      ["detectedAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: pagination.pageSize,
    offset: toOffset(pagination),
  });

  return toPaginated(rows.map(toChangeItem), count, pagination);
}

// Lists every stored set of annual accounts of a company on the user's
// watchlist, newest first, including years Brreg no longer shows.
export async function getCompanyAccounts(
  userPublicId: string,
  orgNumber: string,
): Promise<CompanyAccounts> {
  const userId = await getInternalUserId(userPublicId);
  const entry = await findEntry(userId, orgNumber);

  return {
    status: entry.company.accountsStatus,
    accounts: await getStoredAccounts(entry.companyId),
  };
}

// The full risk report of a company on the user's watchlist, from stored
// data including the company's change history.
export async function getCompanyRisk(
  userPublicId: string,
  orgNumber: string,
): Promise<RiskAssessment> {
  const userId = await getInternalUserId(userPublicId);
  const entry = await findEntry(userId, orgNumber);
  return assessFollowedCompany(entry.company);
}

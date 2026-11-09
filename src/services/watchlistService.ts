import { UniqueConstraintError } from "sequelize";
import { User } from "../models/User.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { WatchlistEntry } from "../models/WatchlistEntry.js";
import { getCompany } from "./brregService.js";
import type { Company } from "../types/company.js";

export class UserNotFoundError extends Error {}
export class CompanyNotFoundError extends Error {}
export class AlreadyWatchingError extends Error {}
export class NotWatchingError extends Error {}

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
}

function toWatchlistItem(entry: WatchlistEntry): WatchlistItem {
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
  };
}

// Tokens carry the public user id; the tables are linked by the internal id.
async function getInternalUserId(userPublicId: string): Promise<number> {
  const user = await User.findOne({
    where: { publicId: userPublicId },
    attributes: ["id"],
  });
  if (!user) {
    throw new UserNotFoundError("User not found");
  }
  return user.id;
}

// Returns the stored company, or fetches it from Brreg and stores it
// the first time anyone follows it.
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

  try {
    return await CompanyRecord.create({
      orgNumber: company.orgNumber,
      name: company.name,
      snapshot: company,
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

// Lists the user's watchlist, sorted by company name.
export async function getWatchlist(
  userPublicId: string,
): Promise<WatchlistItem[]> {
  const userId = await getInternalUserId(userPublicId);

  const entries = await WatchlistEntry.findAll({
    where: { userId },
    include: [CompanyRecord],
    order: [["company", "name", "ASC"]],
  });

  return entries.map(toWatchlistItem);
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
    return toWatchlistItem(entry);
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

  return toWatchlistItem(entry);
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

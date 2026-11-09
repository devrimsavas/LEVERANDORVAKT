import { sequelize } from "../config/database.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { CompanyChange } from "../models/CompanyChange.js";
import { BrregSyncState } from "../models/BrregSyncState.js";
import {
  getLatestUpdateId,
  getUpdatesSince,
  lookupCompany,
} from "./brregService.js";
import { detectChanges } from "./companyDiff.js";
import { notifyFollowers } from "./notificationService.js";
import type { BrregUpdate } from "../types/brreg.js";

// Brreg accepts a list of organization numbers in one request; keep URLs short
const ORG_NUMBERS_PER_REQUEST = 100;
const UPDATES_PER_REQUEST = 1000;

export interface ChangeDetectionSummary {
  // True on the very first run, when only the starting point is recorded
  initialized: boolean;
  companiesChecked: number;
  changesFound: number;
  failedCompanies: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Reads every update for the given companies from fromUpdateId onwards.
async function fetchUpdates(
  fromUpdateId: number,
  orgNumbers: string[],
): Promise<BrregUpdate[]> {
  const updates: BrregUpdate[] = [];

  for (const orgChunk of chunk(orgNumbers, ORG_NUMBERS_PER_REQUEST)) {
    let cursor = fromUpdateId;

    while (true) {
      const batch = await getUpdatesSince(
        cursor,
        orgChunk,
        UPDATES_PER_REQUEST,
      );
      updates.push(...batch);

      const last = batch.at(-1);
      if (!last || batch.length < UPDATES_PER_REQUEST) {
        break;
      }
      cursor = last.oppdateringsid + 1;
    }
  }

  return updates.sort((a, b) => a.oppdateringsid - b.oppdateringsid);
}

// Compares one company with its current state in Brreg and records what changed.
// Returns the number of changes recorded.
async function checkCompany(
  record: CompanyRecord,
  sourceUpdateId: number,
): Promise<number> {
  const lookup = await lookupCompany(record.orgNumber);
  const now = new Date();

  // Struck off or removed from the register: record it once and keep
  // the last known active state as the snapshot.
  if (lookup.status !== "active") {
    if (record.deletedFromRegistryAt) {
      return 0;
    }

    const deletedDate = lookup.status === "deleted" ? lookup.deletedDate : null;

    await sequelize.transaction(async (transaction) => {
      const change = await CompanyChange.create(
        {
          companyId: record.id,
          field: "deletedFromRegistry",
          oldValue: null,
          newValue: deletedDate,
          severity: "critical",
          sourceUpdateId: String(sourceUpdateId),
          detectedAt: now,
        },
        { transaction },
      );
      await notifyFollowers(record.id, [change], transaction);

      record.deletedFromRegistryAt = deletedDate ? new Date(deletedDate) : now;
      record.lastCheckedAt = now;
      record.lastChangedAt = now;
      await record.save({ transaction });
    });

    return 1;
  }

  const changes = detectChanges(record.snapshot, lookup.company);

  // The changes and the new snapshot are saved together, or not at all
  await sequelize.transaction(async (transaction) => {
    if (changes.length > 0) {
      const savedChanges = await CompanyChange.bulkCreate(
        changes.map((change) => ({
          companyId: record.id,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          severity: change.severity,
          sourceUpdateId: String(sourceUpdateId),
          detectedAt: now,
        })),
        { transaction },
      );
      await notifyFollowers(record.id, savedChanges, transaction);
      record.lastChangedAt = now;
    }

    record.snapshot = lookup.company;
    record.name = lookup.company.name;
    record.lastCheckedAt = now;
    await record.save({ transaction });
  });

  return changes.length;
}

// One run of change detection:
// 1. read the Brreg update feed from where the previous run stopped,
// 2. check every followed company that appears in it,
// 3. remember where to continue next time.
export async function runChangeDetection(): Promise<ChangeDetectionSummary> {
  const summary: ChangeDetectionSummary = {
    initialized: false,
    companiesChecked: 0,
    changesFound: 0,
    failedCompanies: 0,
  };

  const state = await BrregSyncState.findOne();

  // First run ever: start from the newest update instead of the whole history
  if (!state) {
    const latestUpdateId = await getLatestUpdateId();
    await BrregSyncState.create({
      lastUpdateId: String(latestUpdateId),
      lastRunAt: new Date(),
    });
    summary.initialized = true;
    return summary;
  }

  const records = await CompanyRecord.findAll({
    where: { deletedFromRegistryAt: null },
  });
  const lastUpdateId = Number(state.lastUpdateId);
  let newLastUpdateId = lastUpdateId;

  if (records.length > 0) {
    const updates = await fetchUpdates(
      lastUpdateId + 1,
      records.map((record) => record.orgNumber),
    );

    // Group the updates per company, in the order they first appear in the feed
    const updatesByOrgNumber = new Map<string, BrregUpdate[]>();
    for (const update of updates) {
      const list = updatesByOrgNumber.get(update.organisasjonsnummer) ?? [];
      list.push(update);
      updatesByOrgNumber.set(update.organisasjonsnummer, list);
    }

    const recordsByOrgNumber = new Map(
      records.map((record) => [record.orgNumber, record]),
    );

    for (const [orgNumber, companyUpdates] of updatesByOrgNumber) {
      const record = recordsByOrgNumber.get(orgNumber);
      if (!record) {
        continue;
      }

      const firstUpdateId = companyUpdates[0]!.oppdateringsid;
      const lastCompanyUpdateId = companyUpdates.at(-1)!.oppdateringsid;

      try {
        summary.changesFound += await checkCompany(record, lastCompanyUpdateId);
        summary.companiesChecked += 1;
        newLastUpdateId = Math.max(newLastUpdateId, lastCompanyUpdateId);
      } catch (error) {
        // Stop here and continue from this company's first update next time.
        // Companies already checked may be checked again; that records nothing new.
        console.error(`Change detection: could not check ${orgNumber}`, error);
        summary.failedCompanies += 1;
        newLastUpdateId = firstUpdateId - 1;
        break;
      }
    }
  }

  state.lastUpdateId = String(newLastUpdateId);
  state.lastRunAt = new Date();
  await state.save();

  return summary;
}

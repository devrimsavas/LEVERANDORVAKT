import { sequelize } from "../config/database.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { CompanyChange } from "../models/CompanyChange.js";
import { BrregSyncState } from "../models/BrregSyncState.js";
import {
  getCompanyRoles,
  getLatestRoleEventId,
  getLatestUpdateId,
  getRoleEventsAfter,
  getUpdatesSince,
  lookupCompany,
} from "./brregService.js";
import { detectChanges } from "./companyDiff.js";
import { detectRoleChanges } from "./roleDiff.js";
import { notifyFollowers } from "./notificationService.js";
import { assessMissingRiskLevels, reassessRisk } from "./riskService.js";
import type { ChangeSeverity } from "../models/CompanyChange.js";

// Brreg accepts a list of organization numbers in one request; keep URLs short
const ORG_NUMBERS_PER_REQUEST = 100;
const EVENTS_PER_REQUEST = 1000;
// How many companies without stored roles get their roles filled in per run
const ROLE_BACKFILL_PER_RUN = 50;

export interface ChangeDetectionSummary {
  // True on the very first run, when only the starting point is recorded
  initialized: boolean;
  companiesChecked: number;
  changesFound: number;
  failedCompanies: number;
}

// One event from either feed that points at a company
interface FeedEvent {
  id: number;
  orgNumber: string;
  // When the change was registered; used to process companies in order
  time: number;
}

// The ids of the feed events that point at one company, oldest first
interface CompanyEvents {
  orgNumber: string;
  updateIds: number[];
  roleEventIds: number[];
  firstTime: number;
}

// A change ready to be saved, from either the company data or the roles
interface DetectedChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  severity: ChangeSeverity;
  sourceUpdateId: number | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Reads every company feed update for the given companies after lastUpdateId.
async function fetchCompanyUpdates(
  lastUpdateId: number,
  orgNumbers: string[],
): Promise<FeedEvent[]> {
  const updates: FeedEvent[] = [];

  for (const orgChunk of chunk(orgNumbers, ORG_NUMBERS_PER_REQUEST)) {
    let fromId = lastUpdateId + 1;

    while (true) {
      const batch = await getUpdatesSince(fromId, orgChunk, EVENTS_PER_REQUEST);
      updates.push(
        ...batch.map((u) => ({
          id: u.oppdateringsid,
          orgNumber: u.organisasjonsnummer,
          time: Date.parse(u.dato),
        })),
      );

      const last = batch.at(-1);
      if (!last || batch.length < EVENTS_PER_REQUEST) {
        break;
      }
      fromId = last.oppdateringsid + 1;
    }
  }

  return updates;
}

// Reads every role feed event for the given companies after lastRoleEventId.
async function fetchRoleEvents(
  lastRoleEventId: number,
  orgNumbers: string[],
): Promise<FeedEvent[]> {
  const events: FeedEvent[] = [];

  for (const orgChunk of chunk(orgNumbers, ORG_NUMBERS_PER_REQUEST)) {
    let afterId = lastRoleEventId;

    while (true) {
      const batch = await getRoleEventsAfter(afterId, orgChunk, EVENTS_PER_REQUEST);
      events.push(
        ...batch.map((e) => ({
          id: Number(e.id),
          orgNumber: e.data.organisasjonsnummer,
          time: Date.parse(e.time),
        })),
      );

      const last = batch.at(-1);
      if (!last || batch.length < EVENTS_PER_REQUEST) {
        break;
      }
      afterId = Number(last.id);
    }
  }

  return events;
}

// Groups the events of both feeds per company. Companies are returned in the
// order their oldest event happened, so changes are processed chronologically.
function groupByCompany(updates: FeedEvent[], roleEvents: FeedEvent[]): CompanyEvents[] {
  const byCompany = new Map<string, CompanyEvents>();
  const entry = (event: FeedEvent) => {
    let events = byCompany.get(event.orgNumber);
    if (!events) {
      events = { orgNumber: event.orgNumber, updateIds: [], roleEventIds: [], firstTime: event.time };
      byCompany.set(event.orgNumber, events);
    }
    events.firstTime = Math.min(events.firstTime, event.time);
    return events;
  };

  for (const update of updates) {
    entry(update).updateIds.push(update.id);
  }
  for (const roleEvent of roleEvents) {
    entry(roleEvent).roleEventIds.push(roleEvent.id);
  }
  for (const events of byCompany.values()) {
    events.updateIds.sort((a, b) => a - b);
    events.roleEventIds.sort((a, b) => a - b);
  }
  return [...byCompany.values()].sort((a, b) => a.firstTime - b.firstTime);
}

// Where to continue in one feed next time.
// Events of companies that were not checked must be read again, so the
// position stops just before the oldest of them. Otherwise it moves to the
// newest event that was read.
function nextPosition(
  current: number,
  allIds: number[],
  uncheckedIds: number[],
): number {
  if (uncheckedIds.length > 0) {
    return Math.min(...uncheckedIds) - 1;
  }
  return Math.max(current, ...allIds);
}

// Compares one company with its current state in Brreg and records what changed.
// Returns the number of changes recorded.
async function checkCompany(record: CompanyRecord, events: CompanyEvents): Promise<number> {
  const lookup = await lookupCompany(record.orgNumber);
  const now = new Date();
  const lastUpdateId = events.updateIds.at(-1) ?? null;
  const lastRoleEventId = events.roleEventIds.at(-1) ?? null;

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
          sourceUpdateId: lastUpdateId === null ? null : String(lastUpdateId),
          detectedAt: now,
        },
        { transaction },
      );
      await notifyFollowers(record.id, [change], transaction);

      record.deletedFromRegistryAt = deletedDate ? new Date(deletedDate) : now;
      record.lastCheckedAt = now;
      record.lastChangedAt = now;
      await record.save({ transaction });

      // The followers were just notified; the risk rise is only recorded
      await reassessRisk(record, transaction, { notifyRise: false });
    });

    return 1;
  }

  // null means Brreg has no roles for the company; the stored roles are kept
  const roles = await getCompanyRoles(record.orgNumber);

  const changes: DetectedChange[] = [
    ...detectChanges(record.snapshot, lookup.company).map((change) => ({
      ...change,
      sourceUpdateId: lastUpdateId,
    })),
    ...(roles ? detectRoleChanges(record.roles, roles) : []).map((change) => ({
      ...change,
      sourceUpdateId: lastRoleEventId,
    })),
  ];

  // The changes, notifications and the new state are saved together, or not at all
  await sequelize.transaction(async (transaction) => {
    if (changes.length > 0) {
      const savedChanges = await CompanyChange.bulkCreate(
        changes.map((change) => ({
          companyId: record.id,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          severity: change.severity,
          sourceUpdateId: change.sourceUpdateId === null ? null : String(change.sourceUpdateId),
          detectedAt: now,
        })),
        { transaction },
      );
      await notifyFollowers(record.id, savedChanges, transaction);
      record.lastChangedAt = now;
    }

    record.snapshot = lookup.company;
    record.name = lookup.company.name;
    if (roles) {
      record.roles = roles;
    }
    record.lastCheckedAt = now;
    await record.save({ transaction });

    // A rise in risk is notified only if this check had no other news
    await reassessRisk(record, transaction, { notifyRise: changes.length === 0 });
  });

  return changes.length;
}

// Fills in the roles of companies that were followed before roles were tracked.
// Nothing is reported as a change; the roles become the starting point.
// Failures are only logged; the company is tried again on the next run.
async function backfillMissingRoles(records: CompanyRecord[]): Promise<void> {
  const missing = records.filter((record) => record.roles === null).slice(0, ROLE_BACKFILL_PER_RUN);

  for (const record of missing) {
    try {
      const roles = await getCompanyRoles(record.orgNumber);
      if (roles) {
        record.roles = roles;
        await record.save();
      }
    } catch (error) {
      console.error(`Change detection: could not fill in roles for ${record.orgNumber}`, error);
    }
  }
}

// One run of change detection:
// 1. read the company feed and the role feed from where the previous run stopped,
// 2. check every followed company that appears in either feed,
// 3. remember where to continue in each feed next time,
// 4. fill in roles for companies that have none stored yet,
// 5. assess the risk of companies that have no risk level yet.
export async function runChangeDetection(): Promise<ChangeDetectionSummary> {
  const summary: ChangeDetectionSummary = {
    initialized: false,
    companiesChecked: 0,
    changesFound: 0,
    failedCompanies: 0,
  };

  const state = await BrregSyncState.findOne();

  // First run ever: start from the newest events instead of the whole history
  if (!state) {
    const [latestUpdateId, latestRoleEventId] = await Promise.all([
      getLatestUpdateId(),
      getLatestRoleEventId(),
    ]);
    await BrregSyncState.create({
      lastUpdateId: String(latestUpdateId),
      lastRoleEventId: String(latestRoleEventId),
      lastRunAt: new Date(),
    });
    summary.initialized = true;
    return summary;
  }

  // Role tracking was added later: an existing installation starts the role
  // feed from now, and reads it from the next run on
  if (state.lastRoleEventId === null) {
    state.lastRoleEventId = String(await getLatestRoleEventId());
    await state.save();
  }

  const lastUpdateId = Number(state.lastUpdateId);
  const lastRoleEventId = Number(state.lastRoleEventId);
  let updates: FeedEvent[] = [];
  let roleEvents: FeedEvent[] = [];
  const unchecked = new Set<string>();

  const records = await CompanyRecord.findAll({ where: { deletedFromRegistryAt: null } });

  if (records.length > 0) {
    const orgNumbers = records.map((record) => record.orgNumber);
    [updates, roleEvents] = await Promise.all([
      fetchCompanyUpdates(lastUpdateId, orgNumbers),
      fetchRoleEvents(lastRoleEventId, orgNumbers),
    ]);

    const eventsByCompany = groupByCompany(updates, roleEvents);
    const recordsByOrgNumber = new Map(records.map((record) => [record.orgNumber, record]));

    for (const events of eventsByCompany) {
      unchecked.add(events.orgNumber);
    }

    for (const events of eventsByCompany) {
      const orgNumber = events.orgNumber;
      const record = recordsByOrgNumber.get(orgNumber);
      if (!record) {
        unchecked.delete(orgNumber);
        continue;
      }

      try {
        summary.changesFound += await checkCompany(record, events);
        summary.companiesChecked += 1;
        unchecked.delete(orgNumber);
      } catch (error) {
        // Stop here. This company and the ones after it stay unchecked,
        // so their events are read again on the next run.
        console.error(`Change detection: could not check ${orgNumber}`, error);
        summary.failedCompanies += 1;
        break;
      }
    }
  }

  const uncheckedIds = (events: FeedEvent[]) =>
    events.filter((event) => unchecked.has(event.orgNumber)).map((event) => event.id);

  state.lastUpdateId = String(
    nextPosition(lastUpdateId, updates.map((event) => event.id), uncheckedIds(updates)),
  );
  state.lastRoleEventId = String(
    nextPosition(lastRoleEventId, roleEvents.map((event) => event.id), uncheckedIds(roleEvents)),
  );
  state.lastRunAt = new Date();
  await state.save();

  await backfillMissingRoles(records);
  await assessMissingRiskLevels();

  return summary;
}
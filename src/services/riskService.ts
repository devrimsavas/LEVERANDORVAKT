import { Op } from "sequelize";
import type { Transaction } from "sequelize";
import { sequelize } from "../config/database.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { CompanyChange } from "../models/CompanyChange.js";
import { getAnnualAccounts, lookupCompany } from "./brregService.js";
import { getStoredAccounts } from "./storedAccounts.js";
import { notifyFollowers } from "./notificationService.js";
import { assessRisk, RISK_RULES } from "./riskAssessment.js";
import type { RiskAssessment, RiskInput, RiskLevel } from "../types/risk.js";

const LEVEL_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
const DAY_MS = 24 * 60 * 60 * 1000;
// How many companies without a risk level are assessed per run
const MISSING_RISK_PER_RUN = 200;

// Builds the risk input of a followed company from stored data
async function storedRiskInput(
  record: CompanyRecord,
  now: Date,
  transaction?: Transaction,
): Promise<RiskInput> {
  const from = new Date(now.getTime() - RISK_RULES.historyDays * DAY_MS);
  const options = transaction ? { transaction } : {};

  const [accounts, changes] = await Promise.all([
    getStoredAccounts(record.id, transaction),
    CompanyChange.findAll({
      where: { companyId: record.id, detectedAt: { [Op.gte]: from } },
      ...options,
    }),
  ]);

  return {
    orgNumber: record.orgNumber,
    name: record.name,
    company: record.snapshot,
    struckOff: record.deletedFromRegistryAt
      ? { date: record.deletedFromRegistryAt.toISOString().slice(0, 10) }
      : null,
    accounts: { status: record.accountsStatus ?? "unknown", list: accounts },
    history: { since: record.createdAt, changes },
  };
}

// Assesses a followed company from stored data, including its change history
export async function assessFollowedCompany(
  record: CompanyRecord,
  now = new Date(),
): Promise<RiskAssessment> {
  return assessRisk(await storedRiskInput(record, now), now);
}

// Assesses any company from live Brreg data, for checking a company before
// following it. Its change history is unknown. Returns null if the company
// does not exist. If the accounts cannot be fetched the assessment still
// returns, with that listed as a limitation.
export async function assessCompanyLive(
  orgNumber: string,
  now = new Date(),
): Promise<RiskAssessment | null> {
  const lookup = await lookupCompany(orgNumber);
  if (lookup.status === "notFound") {
    return null;
  }

  let accounts: RiskInput["accounts"];
  try {
    const result = await getAnnualAccounts(orgNumber);
    accounts = { status: result.status, list: result.accounts };
  } catch (error) {
    console.error(`Risk: could not fetch the accounts of ${orgNumber}`, error);
    accounts = { status: "unknown", list: [] };
  }

  const active = lookup.status === "active";
  return assessRisk(
    {
      orgNumber,
      name: active ? lookup.company.name : null,
      company: active ? lookup.company : null,
      struckOff: active ? null : { date: lookup.deletedDate },
      accounts,
      history: null,
    },
    now,
  );
}

// Assesses a followed company again and stores the result, inside the
// caller's transaction (after its changes have been saved, so they count).
// A different level is recorded as a "riskLevel" change. A rise is notified
// only when notifyRise is true: when the same check already notified the
// followers of other changes, they would get the same news twice.
// The first assessment is only the starting point.
export async function reassessRisk(
  record: CompanyRecord,
  transaction: Transaction,
  options: { notifyRise: boolean },
): Promise<void> {
  const now = new Date();
  const assessment = assessRisk(
    await storedRiskInput(record, now, transaction),
    now,
  );

  const previousLevel = record.riskLevel;
  const previousScore = record.riskScore;

  record.riskLevel = assessment.level;
  record.riskScore = assessment.score;
  record.riskAssessedAt = now;

  if (previousLevel !== null && previousLevel !== assessment.level) {
    const rose = LEVEL_RANK[assessment.level] > LEVEL_RANK[previousLevel];
    const change = await CompanyChange.create(
      {
        companyId: record.id,
        field: "riskLevel",
        oldValue: { level: previousLevel, score: previousScore },
        newValue: {
          level: assessment.level,
          score: assessment.score,
          signals: assessment.signals.map((s) => s.code),
        },
        severity: !rose
          ? "info"
          : assessment.level === "high"
            ? "critical"
            : "warning",
        sourceUpdateId: null,
        detectedAt: now,
      },
      { transaction },
    );

    if (rose && options.notifyRise) {
      await notifyFollowers(record.id, [change], transaction);
    }
    record.lastChangedAt = now;
  }

  await record.save({ transaction });
}

// Assesses followed companies that have no risk level yet, e.g. companies
// followed before risk signals were added. Uses stored data only, so Brreg
// is not called. Nothing is reported: the level becomes the starting point.
// Failures are only logged; the company is tried again on the next run.
export async function assessMissingRiskLevels(): Promise<void> {
  const records = await CompanyRecord.findAll({
    where: { riskLevel: null },
    order: [["id", "ASC"]],
    limit: MISSING_RISK_PER_RUN,
  });

  for (const record of records) {
    try {
      await sequelize.transaction((transaction) =>
        reassessRisk(record, transaction, { notifyRise: false }),
      );
    } catch (error) {
      console.error(`Risk: could not assess ${record.orgNumber}`, error);
    }
  }
}

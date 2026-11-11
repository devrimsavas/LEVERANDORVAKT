import { Op } from "sequelize";
import type { Transaction } from "sequelize";
import { sequelize } from "../config/database.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { CompanyChange } from "../models/CompanyChange.js";
import { AnnualAccountsRecord } from "../models/AnnualAccountsRecord.js";
import { getAnnualAccounts } from "./brregService.js";
import { compareAccounts } from "./accountsDiff.js";
import { getStoredAccounts } from "./storedAccounts.js";
import { notifyFollowers } from "./notificationService.js";
import { reassessRisk } from "./riskService.js";
import type { AnnualAccounts } from "../types/annualAccounts.js";

// A company's accounts are checked again when the last check is older than this.
// A little under a day, so a daily run never skips a company by a few minutes.
const RECHECK_AFTER_HOURS = 20;
// How many companies are checked per run; the rest wait for the next run
const COMPANIES_PER_RUN = 200;

export interface AccountsCheckSummary {
  companiesChecked: number;
  changesFound: number;
  failedCompanies: number;
}

// Inserts new accounts and replaces the stored row of a corrected filing
async function saveAccounts(
  companyId: number,
  list: AnnualAccounts[],
  transaction: Transaction,
): Promise<void> {
  for (const accounts of list) {
    const values = {
      companyId,
      brregId: String(accounts.brregId),
      year: accounts.year,
      periodStart: accounts.periodStart,
      periodEnd: accounts.periodEnd,
      type: accounts.type,
      currency: accounts.currency,
      accountingRules: accounts.accountingRules,
      audited: accounts.audited,
      auditOptedOut: accounts.auditOptedOut,
      liquidation: accounts.liquidation,
      figures: accounts.figures,
    };

    const existing = await AnnualAccountsRecord.findOne({
      where: { companyId, type: accounts.type, periodEnd: accounts.periodEnd },
      transaction,
    });

    if (existing) {
      await existing.update(values, { transaction });
    } else {
      await AnnualAccountsRecord.create(values, { transaction });
    }
  }
}

// Fetches a company's accounts from Brreg, stores what is new and records
// the changes. The first check only stores the starting point.
// Returns the number of changes recorded.
export async function checkCompanyAccounts(
  record: CompanyRecord,
): Promise<number> {
  const result = await getAnnualAccounts(record.orgNumber);
  const now = new Date();

  // The new accounts, changes, notifications and the check time
  // are saved together, or not at all
  return sequelize.transaction(async (transaction) => {
    let changeCount = 0;

    if (result.status === "available") {
      const previous =
        record.accountsCheckedAt === null
          ? null
          : await getStoredAccounts(record.id, transaction);
      const { toSave, changes } = compareAccounts(previous, result.accounts);

      await saveAccounts(record.id, toSave, transaction);

      if (changes.length > 0) {
        const savedChanges = await CompanyChange.bulkCreate(
          changes.map((change) => ({
            companyId: record.id,
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
            severity: change.severity,
            sourceUpdateId: null,
            detectedAt: now,
          })),
          { transaction },
        );
        await notifyFollowers(record.id, savedChanges, transaction);
        record.lastChangedAt = now;
        changeCount = changes.length;
      }
    }

    record.accountsStatus = result.status;
    record.accountsCheckedAt = now;
    await record.save({ transaction });

    // Also runs when nothing changed: an overdue filing raises the risk
    // just by time passing
    await reassessRisk(record, transaction, {
      notifyRise: changeCount === 0,
    });

    return changeCount;
  });
}

// One run of the accounts check: the companies whose accounts were never
// checked or not checked recently, the longest waiting first.
// A company that fails is skipped and tried again on the next run; unlike
// change detection there is no feed position to keep, so the others go on.
export async function runAccountsCheck(): Promise<AccountsCheckSummary> {
  const summary: AccountsCheckSummary = {
    companiesChecked: 0,
    changesFound: 0,
    failedCompanies: 0,
  };

  const recheckBefore = new Date(
    Date.now() - RECHECK_AFTER_HOURS * 60 * 60 * 1000,
  );

  const records = await CompanyRecord.findAll({
    where: {
      // Struck-off companies file no new accounts
      deletedFromRegistryAt: null,
      [Op.or]: [
        { accountsCheckedAt: null },
        { accountsCheckedAt: { [Op.lt]: recheckBefore } },
      ],
    },
    order: [
      // Never checked first, then the oldest check
      ["accountsCheckedAt", "ASC NULLS FIRST"],
      ["id", "ASC"],
    ],
    limit: COMPANIES_PER_RUN,
  });

  for (const record of records) {
    try {
      summary.changesFound += await checkCompanyAccounts(record);
      summary.companiesChecked += 1;
    } catch (error) {
      console.error(
        `Accounts check: could not check ${record.orgNumber}`,
        error,
      );
      summary.failedCompanies += 1;
    }
  }

  return summary;
}

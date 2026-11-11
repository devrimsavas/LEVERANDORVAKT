import type { Transaction } from "sequelize";
import { AnnualAccountsRecord } from "../models/AnnualAccountsRecord.js";
import { fromAnnualAccountsRecord } from "../mappers/annualAccountsMapper.js";
import type { AnnualAccounts } from "../types/annualAccounts.js";

// Reading stored annual accounts, shared by the accounts check, the watchlist
// and the risk assessment. Kept in its own module so those services do not
// have to import each other.

// The stored accounts of a company, newest first,
// the company's own accounts before the group's
export async function getStoredAccounts(
  companyId: number,
  transaction?: Transaction,
): Promise<AnnualAccounts[]> {
  const rows = await AnnualAccountsRecord.findAll({
    where: { companyId },
    order: [
      ["periodEnd", "DESC"],
      ["type", "ASC"],
    ],
    ...(transaction ? { transaction } : {}),
  });
  return rows.map(fromAnnualAccountsRecord);
}

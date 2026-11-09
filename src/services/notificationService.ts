import type { Transaction } from "sequelize";
import { Notification } from "../models/Notification.js";
import { WatchlistEntry } from "../models/WatchlistEntry.js";
import type { CompanyChange } from "../models/CompanyChange.js";

// Creates one notification per change for every user who follows the company.
// Runs inside the caller's transaction, so changes and notifications are saved together.
// Returns the number of notifications created.
export async function notifyFollowers(
  companyId: number,
  changes: CompanyChange[],
  transaction: Transaction,
): Promise<number> {
  if (changes.length === 0) {
    return 0;
  }

  const followers = await WatchlistEntry.findAll({
    where: { companyId },
    attributes: ["userId"],
    transaction,
  });

  if (followers.length === 0) {
    return 0;
  }

  const rows = followers.flatMap((follower) =>
    changes.map((change) => ({
      userId: follower.userId,
      companyChangeId: change.id,
    })),
  );

  await Notification.bulkCreate(rows, { transaction });

  return rows.length;
}

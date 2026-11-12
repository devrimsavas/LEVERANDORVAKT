import { Op } from "sequelize";
import { User } from "../models/User.js";
import { WatchlistEntry } from "../models/WatchlistEntry.js";
import { AssistantUsage } from "../models/AssistantUsage.js";

// The "getting started" list on the overview page. Each step is read from
// what the user has actually done, so it is never out of step with the
// data: following a company, writing a private note and asking the
// assistant. Only closing the list is stored.
export interface Onboarding {
  steps: {
    followCompany: boolean;
    writeNote: boolean;
    askAssistant: boolean;
  };
  completed: boolean;
  dismissedAt: Date | null;
}

async function buildOnboarding(user: User): Promise<Onboarding> {
  const [followed, noted, asked] = await Promise.all([
    WatchlistEntry.count({ where: { userId: user.id } }),
    WatchlistEntry.count({
      where: { userId: user.id, note: { [Op.ne]: null } },
    }),
    // Usage rows stay when a conversation is deleted, so asking once counts
    AssistantUsage.count({ where: { userId: user.id } }),
  ]);
  const steps = {
    followCompany: followed > 0,
    writeNote: noted > 0,
    askAssistant: asked > 0,
  };
  return {
    steps,
    completed: Object.values(steps).every(Boolean),
    dismissedAt: user.onboardingDismissedAt,
  };
}

// null when the user no longer exists
export async function getOnboarding(
  userPublicId: string,
): Promise<Onboarding | null> {
  const user = await User.findOne({ where: { publicId: userPublicId } });
  return user ? buildOnboarding(user) : null;
}

// Closes the list for good. Closing it again keeps the first time.
export async function dismissOnboarding(
  userPublicId: string,
): Promise<Onboarding | null> {
  const user = await User.findOne({ where: { publicId: userPublicId } });
  if (!user) return null;
  if (user.onboardingDismissedAt === null) {
    user.onboardingDismissedAt = new Date();
    await user.save();
  }
  return buildOnboarding(user);
}

import { Sequelize } from "sequelize-typescript";
import { User } from "../models/User.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { WatchlistEntry } from "../models/WatchlistEntry.js";
import { CompanyChange } from "../models/CompanyChange.js";
import { BrregSyncState } from "../models/BrregSyncState.js";
import { Notification } from "../models/Notification.js";
import { AnnualAccountsRecord } from "../models/AnnualAccountsRecord.js";
import { AssistantConversation } from "../models/AssistantConversation.js";
import { AssistantMessage } from "../models/AssistantMessage.js";
import { AssistantUsage } from "../models/AssistantUsage.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  models: [
    User,
    CompanyRecord,
    WatchlistEntry,
    CompanyChange,
    BrregSyncState,
    Notification,
    AnnualAccountsRecord,
    AssistantConversation,
    AssistantMessage,
    AssistantUsage,
  ],
});

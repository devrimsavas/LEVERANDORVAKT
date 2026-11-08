import { Sequelize } from "sequelize-typescript";
import { User } from "../models/User.js";
import { CompanyRecord } from "../models/CompanyRecord.js";
import { WatchlistEntry } from "../models/WatchlistEntry.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  models: [User, CompanyRecord, WatchlistEntry],
});
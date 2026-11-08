import { Sequelize } from "sequelize-typescript";
import { User } from "../models/User.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  models: [User], // models will be registered here
});

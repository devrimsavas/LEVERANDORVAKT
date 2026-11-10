import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export async function up({ context: queryInterface }: MigrationParams) {
  // Every set of annual accounts seen for a followed company.
  // Rows are never deleted: Brreg only keeps the last three years,
  // so older accounts are only available here.
  await queryInterface.createTable("annual_accounts", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // Accounts are history: a company with accounts cannot be deleted
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "companies", key: "id" },
      onDelete: "RESTRICT",
    },
    // Brreg's id for this set of accounts. A corrected filing gets a new id.
    brreg_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    // The year the accounting period ends in
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    period_start: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    period_end: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    // "company" or "group"
    type: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: true,
    },
    accounting_rules: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    audited: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    audit_opted_out: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    liquidation: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    // Key figures (the app's AnnualAccountsFigures shape)
    figures: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    // created_at: when the accounts were first seen
    // updated_at: when a corrected filing last replaced them
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // One row per company, type and period; a corrected filing replaces the row
  await queryInterface.addConstraint("annual_accounts", {
    fields: ["company_id", "type", "period_end"],
    type: "unique",
    name: "annual_accounts_company_type_period_unique",
  });

  // null: the company's accounts have never been checked.
  // "available" or "unsupported" (e.g. banks, which the register does not cover).
  await queryInterface.addColumn("companies", "accounts_status", {
    type: DataTypes.STRING(20),
    allowNull: true,
  });

  // When the accounts were last checked; the daily check picks the oldest first
  await queryInterface.addColumn("companies", "accounts_checked_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.removeColumn("companies", "accounts_checked_at");
  await queryInterface.removeColumn("companies", "accounts_status");
  await queryInterface.dropTable("annual_accounts");
}

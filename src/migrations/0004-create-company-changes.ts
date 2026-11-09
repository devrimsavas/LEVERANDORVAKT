import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("company_changes", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // Changes are history: a company with changes cannot be deleted
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "companies", key: "id" },
      onDelete: "RESTRICT",
    },
    // Name of the changed field in the Company shape, e.g. "isBankrupt" or "address"
    field: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    old_value: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    new_value: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    // "critical", "warning" or "info"
    severity: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    // The Brreg update that revealed this change
    source_update_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    detected_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Fast "history of this company, newest first"
  await queryInterface.addIndex(
    "company_changes",
    ["company_id", "detected_at"],
    {
      name: "company_changes_company_detected_idx",
    },
  );
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("company_changes");
}

import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Answers from Brreg and Kartverket that change slowly (registration counts
// of past months, industry breakdowns, the municipality list), kept so the
// same chart does not call the registers again.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("trend_cache", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // What was asked, e.g. "count:5601|55||2026-03"
    key: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true,
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    // After this the value is fetched again
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("trend_cache");
}

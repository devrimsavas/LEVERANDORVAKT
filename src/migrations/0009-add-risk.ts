import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// The latest risk assessment of each followed company. Stored so the
// watchlist can be sorted by risk and a rising level can be noticed.
// null: not assessed yet.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.addColumn("companies", "risk_level", {
    type: DataTypes.STRING(10),
    allowNull: true,
  });
  await queryInterface.addColumn("companies", "risk_score", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await queryInterface.addColumn("companies", "risk_assessed_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.removeColumn("companies", "risk_assessed_at");
  await queryInterface.removeColumn("companies", "risk_score");
  await queryInterface.removeColumn("companies", "risk_level");
}

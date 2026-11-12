import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// When the user closed the "getting started" list. null: still shown.
// The steps themselves are not stored; they are read from the user's data.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.addColumn("users", "onboarding_dismissed_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.removeColumn("users", "onboarding_dismissed_at");
}

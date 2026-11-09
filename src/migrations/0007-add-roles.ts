import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export async function up({ context: queryInterface }: MigrationParams) {
  // Last known roles of the company (the app's CompanyRoles shape).
  // null means the roles have not been fetched yet.
  await queryInterface.addColumn("companies", "roles", {
    type: DataTypes.JSONB,
    allowNull: true,
  });

  // Where change detection left off in the role update feed.
  // The role feed has its own ids, separate from the company feed.
  await queryInterface.addColumn("brreg_sync_state", "last_role_event_id", {
    type: DataTypes.BIGINT,
    allowNull: true,
  });
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.removeColumn("brreg_sync_state", "last_role_event_id");
  await queryInterface.removeColumn("companies", "roles");
}

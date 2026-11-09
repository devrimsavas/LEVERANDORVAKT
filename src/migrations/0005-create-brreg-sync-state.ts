import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export async function up({ context: queryInterface }: MigrationParams) {
  // A single-row table: where the change detection job left off
  await queryInterface.createTable("brreg_sync_state", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // Last processed update id from the Brreg update feed
    last_update_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    last_run_at: {
      type: DataTypes.DATE,
      allowNull: true,
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
  await queryInterface.dropTable("brreg_sync_state");
}

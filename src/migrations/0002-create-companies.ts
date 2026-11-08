import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("companies", {
    // Internal primary key, never exposed outside the database
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // Norwegian organization number, the company's public identifier
    org_number: {
      type: DataTypes.CHAR(9),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    // Last known state of the company (the app's Company shape)
    snapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    deleted_from_registry_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_checked_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    last_changed_at: {
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
  await queryInterface.dropTable("companies");
}

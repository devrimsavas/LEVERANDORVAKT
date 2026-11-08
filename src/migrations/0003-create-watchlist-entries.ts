import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("watchlist_entries", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // Deleting a user also deletes their watchlist
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    // A company that someone follows cannot be deleted
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "companies", key: "id" },
      onDelete: "RESTRICT",
    },
    note: {
      type: DataTypes.STRING(500),
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

  // A user can follow the same company only once
  await queryInterface.addConstraint("watchlist_entries", {
    fields: ["user_id", "company_id"],
    type: "unique",
    name: "watchlist_entries_user_company_unique",
  });
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("watchlist_entries");
}

import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Password reset links, and when a user's password last changed, so that
// sessions started before a change are ended
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("password_reset_tokens", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    // SHA-256 of the token in the link; the token itself is never stored
    token_hash: {
      type: DataTypes.CHAR(64),
      allowNull: false,
      unique: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });
  await queryInterface.addIndex("password_reset_tokens", ["user_id"]);

  await queryInterface.addColumn("users", "password_changed_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.removeColumn("users", "password_changed_at");
  await queryInterface.dropTable("password_reset_tokens");
}

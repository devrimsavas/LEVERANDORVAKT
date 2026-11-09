import { DataTypes, literal } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("notifications", {
    // Internal primary key, never exposed outside the database
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // Public identifier, used in the API
    public_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      defaultValue: literal("gen_random_uuid()"),
    },
    // Deleting a user also deletes their notifications
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    // The change this notification is about
    company_change_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "company_changes", key: "id" },
      onDelete: "CASCADE",
    },
    // null means unread
    read_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // A user gets one notification per change
  await queryInterface.addConstraint("notifications", {
    fields: ["user_id", "company_change_id"],
    type: "unique",
    name: "notifications_user_change_unique",
  });

  // Fast "my notifications, newest first"
  await queryInterface.addIndex("notifications", ["user_id", "created_at"], {
    name: "notifications_user_created_idx",
  });
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("notifications");
}

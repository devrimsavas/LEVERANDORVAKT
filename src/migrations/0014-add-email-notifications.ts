import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Email notifications: each user's language and choice (at once, a daily
// summary or none), when they last got a daily summary, and which
// notifications have been emailed, so none is sent twice
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.addColumn("users", "language", {
    type: DataTypes.STRING(2),
    allowNull: false,
    defaultValue: "en",
  });
  await queryInterface.addColumn("users", "email_notifications", {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: "daily",
  });
  await queryInterface.addColumn("users", "last_digest_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await queryInterface.addColumn("notifications", "emailed_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  // The email job looks for notifications not emailed yet
  await queryInterface.addIndex("notifications", ["emailed_at", "created_at"]);
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.removeIndex("notifications", [
    "emailed_at",
    "created_at",
  ]);
  await queryInterface.removeColumn("notifications", "emailed_at");
  await queryInterface.removeColumn("users", "last_digest_at");
  await queryInterface.removeColumn("users", "email_notifications");
  await queryInterface.removeColumn("users", "language");
}

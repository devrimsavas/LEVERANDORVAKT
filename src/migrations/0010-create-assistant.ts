import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export async function up({ context: queryInterface }: MigrationParams) {
  // One conversation of a user with the assistant
  await queryInterface.createTable("assistant_conversations", {
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
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    // Taken from the first question
    title: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    // Moves forward with every new message; conversations are listed by it
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await queryInterface.addIndex("assistant_conversations", [
    "user_id",
    "updated_at",
  ]);

  // The questions and answers of a conversation. Tool calls and their
  // results are not stored: they are produced again for every question.
  await queryInterface.createTable("assistant_messages", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    conversation_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "assistant_conversations", key: "id" },
      onDelete: "CASCADE",
    },
    // "user" or "assistant"
    role: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Names of the tools the answer is based on; empty for questions
    tools_used: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await queryInterface.addIndex("assistant_messages", [
    "conversation_id",
    "id",
  ]);

  // One row per question asked, for the daily limit. Kept apart from the
  // conversations, so deleting a conversation does not reset the limit.
  // Holds no content.
  await queryInterface.createTable("assistant_usage", {
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
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await queryInterface.addIndex("assistant_usage", ["user_id", "created_at"]);
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("assistant_usage");
  await queryInterface.dropTable("assistant_messages");
  await queryInterface.dropTable("assistant_conversations");
}

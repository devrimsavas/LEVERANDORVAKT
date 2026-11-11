import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { AssistantConversation } from "./AssistantConversation.js";

export type AssistantRole = "user" | "assistant";

// A question or an answer in a conversation. Messages never change,
// so there is no updatedAt.
@Table({ tableName: "assistant_messages", underscored: true, updatedAt: false })
export class AssistantMessage extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => AssistantConversation)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare conversationId: number;

  @BelongsTo(() => AssistantConversation)
  declare conversation: AssistantConversation;

  @Column({
    type: DataType.STRING(10),
    allowNull: false,
    validate: { isIn: [["user", "assistant"]] },
  })
  declare role: AssistantRole;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare content: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  declare toolsUsed: string[];
}

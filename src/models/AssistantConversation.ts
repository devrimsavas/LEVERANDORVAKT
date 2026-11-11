import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { User } from "./User.js";

// One conversation of a user with the assistant.
// Its messages are loaded with their own query, so there is no HasMany here:
// the two models would import each other, and the compiled decorator
// metadata fails on such a cycle at startup.
@Table({ tableName: "assistant_conversations", underscored: true })
export class AssistantConversation extends Model {
  // Internal primary key, never exposed outside the database
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // Public identifier, used in the API
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    defaultValue: DataType.UUIDV4,
  })
  declare publicId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @BelongsTo(() => User)
  declare user: User;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare title: string;
}
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
} from "sequelize-typescript";
import { User } from "./User.js";

// One question asked, for the daily limit. Holds no content and is not
// deleted with the conversation, so deleting does not reset the limit.
@Table({ tableName: "assistant_usage", underscored: true, updatedAt: false })
export class AssistantUsage extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;
}

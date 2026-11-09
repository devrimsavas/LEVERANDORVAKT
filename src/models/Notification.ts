import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { User } from "./User.js";
import { CompanyChange } from "./CompanyChange.js";

// Tells one user about one change in a company they follow.
// Only readAt changes after creation, so there is no updatedAt.
@Table({ tableName: "notifications", underscored: true, updatedAt: false })
export class Notification extends Model {
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

  @ForeignKey(() => CompanyChange)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare companyChangeId: number;

  @BelongsTo(() => CompanyChange)
  declare change: CompanyChange;

  // null means unread
  @Column({ type: DataType.DATE, allowNull: true })
  declare readAt: Date | null;
}

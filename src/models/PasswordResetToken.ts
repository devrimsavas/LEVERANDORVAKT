import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
} from "sequelize-typescript";
import { User } from "./User.js";

// A password reset link that has been sent. Only the token's SHA-256 hash
// is stored, so a copy of the database cannot be used to reset passwords.
// The row is deleted when the link is used.
@Table({
  tableName: "password_reset_tokens",
  underscored: true,
  updatedAt: false,
})
export class PasswordResetToken extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Column({ type: DataType.CHAR(64), allowNull: false, unique: true })
  declare tokenHash: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare expiresAt: Date;
}

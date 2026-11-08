import { Table, Column, Model, DataType } from "sequelize-typescript";

export type UserRole = "user" | "admin";

@Table({ tableName: "users", underscored: true })
export class User extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare firstName: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare lastName: string;

  @Column({ type: DataType.STRING(255), allowNull: false, unique: true })
  declare email: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare passwordHash: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: "user",
    validate: { isIn: [["user", "admin"]] },
  })
  declare role: UserRole;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lastLoginAt: Date | null;
}
import { Table, Column, Model, DataType } from "sequelize-typescript";

export type UserRole = "user" | "admin";

@Table({ tableName: "users", underscored: true })
export class User extends Model {
  // Internal primary key, never exposed outside the database
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // Public user number, used in the API and in tokens
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    defaultValue: DataType.UUIDV4,
  })
  declare publicId: string;

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

  // When the "getting started" list was closed; null while it is shown
  @Column({ type: DataType.DATE, allowNull: true })
  declare onboardingDismissedAt: Date | null;
}

import { Table, Column, Model, DataType } from "sequelize-typescript";

export type UserRole = "user" | "admin";

// The languages of the web app; emails are written in the user's one
export const LANGUAGES = ["en", "nb"] as const;
export type Language = (typeof LANGUAGES)[number];

// How the user wants to hear about changes by email. Critical changes
// (such as bankruptcy) are always sent at once, unless it is "off".
export const EMAIL_NOTIFICATIONS = ["instant", "daily", "off"] as const;
export type EmailNotifications = (typeof EMAIL_NOTIFICATIONS)[number];

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

  // When the password was last changed (reset); sessions started before
  // it are no longer accepted
  @Column({ type: DataType.DATE, allowNull: true })
  declare passwordChangedAt: Date | null;

  // When the "getting started" list was closed; null while it is shown
  @Column({ type: DataType.DATE, allowNull: true })
  declare onboardingDismissedAt: Date | null;

  @Column({
    type: DataType.STRING(2),
    allowNull: false,
    defaultValue: "en",
    validate: { isIn: [LANGUAGES] },
  })
  declare language: Language;

  @Column({
    type: DataType.STRING(10),
    allowNull: false,
    defaultValue: "daily",
    validate: { isIn: [EMAIL_NOTIFICATIONS] },
  })
  declare emailNotifications: EmailNotifications;

  // When the last daily summary was sent; at most one a day
  @Column({ type: DataType.DATE, allowNull: true })
  declare lastDigestAt: Date | null;
}

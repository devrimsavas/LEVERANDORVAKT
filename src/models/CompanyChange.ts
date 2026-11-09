import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { CompanyRecord } from "./CompanyRecord.js";

export type ChangeSeverity = "critical" | "warning" | "info";

// One detected change in one field of a followed company.
// Changes are never edited after they are recorded, so there is no updatedAt.
@Table({ tableName: "company_changes", underscored: true, timestamps: false })
export class CompanyChange extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => CompanyRecord)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare companyId: number;

  @BelongsTo(() => CompanyRecord)
  declare company: CompanyRecord;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare field: string;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare oldValue: unknown;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare newValue: unknown;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    validate: { isIn: [["critical", "warning", "info"]] },
  })
  declare severity: ChangeSeverity;

  // BIGINT columns are returned as strings by the pg driver
  @Column({ type: DataType.BIGINT, allowNull: true })
  declare sourceUpdateId: string | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare detectedAt: Date;
}

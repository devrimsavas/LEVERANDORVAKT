import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { CompanyRecord } from "./CompanyRecord.js";
import type {
  AccountsType,
  AnnualAccountsFigures,
} from "../types/annualAccounts.js";

// One set of annual accounts of a followed company.
// Named AnnualAccountsRecord to avoid a clash with the AnnualAccounts type.
@Table({ tableName: "annual_accounts", underscored: true })
export class AnnualAccountsRecord extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => CompanyRecord)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare companyId: number;

  @BelongsTo(() => CompanyRecord)
  declare company: CompanyRecord;

  // BIGINT columns are returned as strings by the pg driver
  @Column({ type: DataType.BIGINT, allowNull: false })
  declare brregId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare year: number;

  // DATEONLY columns are returned as "YYYY-MM-DD" strings
  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare periodStart: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare periodEnd: string;

  @Column({
    type: DataType.STRING(10),
    allowNull: false,
    validate: { isIn: [["company", "group"]] },
  })
  declare type: AccountsType;

  @Column({ type: DataType.STRING(3), allowNull: true })
  declare currency: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  declare accountingRules: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare audited: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare auditOptedOut: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare liquidation: boolean;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare figures: AnnualAccountsFigures;
}

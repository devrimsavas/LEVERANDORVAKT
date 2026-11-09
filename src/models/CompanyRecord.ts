import { Table, Column, Model, DataType } from "sequelize-typescript";
import type { Company } from "../types/company.js";
import type { CompanyRoles } from "../types/companyRoles.js";

// A followed company and its last known state.
// Named CompanyRecord to avoid a clash with the Company type in types/company.ts.
@Table({ tableName: "companies", underscored: true })
export class CompanyRecord extends Model {
  // Internal primary key, never exposed outside the database
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // Norwegian organization number, the company's public identifier
  @Column({ type: DataType.CHAR(9), allowNull: false, unique: true })
  declare orgNumber: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare name: string;

  // Last known state of the company
  @Column({ type: DataType.JSONB, allowNull: false })
  declare snapshot: Company;

  // Last known roles. null means they have not been fetched yet.
  @Column({ type: DataType.JSONB, allowNull: true })
  declare roles: CompanyRoles | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare deletedFromRegistryAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare lastCheckedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lastChangedAt: Date | null;
}